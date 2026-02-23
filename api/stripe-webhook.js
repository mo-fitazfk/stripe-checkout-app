const Stripe = require('stripe');

/**
 * Get raw request body for Stripe signature verification.
 * Tries stream first (when body parsing is disabled); falls back to req.body.
 * Note: JSON.stringify(req.body) can change key order and cause verification to fail.
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.body === 'string') {
      return resolve(req.body);
    }
    if (req.body && typeof req.body === 'object') {
      return resolve(JSON.stringify(req.body));
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!stripeSecretKey || !webhookSecret) {
    console.error('Webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Webhook: failed to read body', err.message);
    res.status(400).json({ error: 'Invalid body' });
    return;
  }

  const stripe = new Stripe(stripeSecretKey);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  if (event.type !== 'checkout.session.completed') {
    res.status(200).json({ received: true });
    return;
  }

  const sessionId = event.data.object.id;

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
  } catch (err) {
    console.error('Webhook: failed to retrieve session', sessionId, err.message);
    res.status(500).json({ error: 'Failed to retrieve session' });
    return;
  }

  const email = session.customer_email || session.customer_details?.email || null;
  const plan = session.metadata?.plan || 'yearly';
  const amountTotal = session.amount_total != null ? session.amount_total : 0;
  const currency = (session.currency || 'aud').toLowerCase();
  const amountFormatted = (amountTotal / 100).toFixed(2);

  if (!shopDomain || !shopToken) {
    console.warn('Webhook: Shopify not configured, skipping draft order');
    res.status(200).json({ received: true });
    return;
  }

  const variantYearly = process.env.SHOPIFY_VARIANT_YEARLY;
  const variantMonthly = process.env.SHOPIFY_VARIANT_MONTHLY;

  let lineItems;
  if (plan === 'yearly' && variantYearly) {
    lineItems = [{ variant_id: parseInt(variantYearly, 10), quantity: 1 }];
  } else if (plan === 'monthly' && variantMonthly) {
    lineItems = [{ variant_id: parseInt(variantMonthly, 10), quantity: 1 }];
  } else {
    const title =
      plan === 'yearly'
        ? 'Platinum Membership - Yearly'
        : 'Platinum Membership - Monthly';
    lineItems = [
      {
        title,
        price: amountFormatted,
        quantity: 1,
        taxable: false,
      },
    ];
  }

  const draftOrder = {
    draft_order: {
      line_items: lineItems,
      email: email || undefined,
      note: `Stripe session: ${sessionId}. Plan: ${plan}.`,
      note_attributes: [
        { name: 'stripe_session_id', value: sessionId },
        { name: 'plan', value: plan },
      ],
    },
  };

  const shopUrl = shopDomain.replace(/^https?:\/\//, '');
  const createUrl = `https://${shopUrl}/admin/api/2024-04/draft_orders.json`;

  try {
    const shopRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': shopToken,
      },
      body: JSON.stringify(draftOrder),
    });

    if (!shopRes.ok) {
      const text = await shopRes.text();
      console.error('Shopify draft order failed', shopRes.status, text);
      res.status(500).json({ error: 'Failed to create draft order' });
      return;
    }

    const createData = await shopRes.json();
    const draftOrderId = createData.draft_order?.id;
    if (draftOrderId) {
      const completeUrl = `https://${shopUrl}/admin/api/2024-04/draft_orders/${draftOrderId}/complete.json`;
      const completeRes = await fetch(completeUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopToken,
        },
      });
      if (!completeRes.ok) {
        const text = await completeRes.text();
        console.error('Shopify complete draft order failed', completeRes.status, text);
      }
    }
  } catch (err) {
    console.error('Shopify request error', err.message);
    res.status(500).json({ error: 'Shopify request failed' });
    return;
  }

  res.status(200).json({ received: true });
};
