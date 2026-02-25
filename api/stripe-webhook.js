const Stripe = require('stripe');

/**
 * Get raw request body for Stripe signature verification.
 * Must be the exact bytes Stripe sent; re-stringifying req.body breaks the signature.
 * Read from the request stream (body parsing must be disabled for this route).
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Create a Shopify draft order and complete it.
 * @param {string} shopUrl - Shop domain without protocol (e.g. your-store.myshopify.com)
 * @param {string} shopToken - Shopify Admin API access token
 * @param {object} draftOrderPayload - { line_items, email?, note, note_attributes }
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function createShopifyDraftOrderAndComplete(shopUrl, shopToken, draftOrderPayload) {
  const createUrl = `https://${shopUrl}/admin/api/2024-04/draft_orders.json`;
  const body = { draft_order: draftOrderPayload };
  const shopRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopToken,
    },
    body: JSON.stringify(body),
  });
  if (!shopRes.ok) {
    const text = await shopRes.text();
    console.error('Shopify draft order failed', shopRes.status, text);
    return { ok: false, error: text };
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
  return { ok: true };
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

  if (event.type !== 'checkout.session.completed' && event.type !== 'invoice.paid') {
    res.status(200).json({ received: true });
    return;
  }

  const shopUrl = shopDomain.replace(/^https?:\/\//, '');
  if (!shopDomain || !shopToken) {
    console.warn('Webhook: Shopify not configured, skipping draft order');
    res.status(200).json({ received: true });
    return;
  }

  const variantYearly = process.env.SHOPIFY_VARIANT_YEARLY;
  const variantMonthly = process.env.SHOPIFY_VARIANT_MONTHLY;
  const priceYearly = process.env.STRIPE_PRICE_YEARLY;
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY;

  function buildLineItems(plan, amountFormatted) {
    // When using variant_id, pass price so trial (0.00) overrides variant list price
    if (plan === 'yearly' && variantYearly) {
      return [{ variant_id: parseInt(variantYearly, 10), quantity: 1, price: amountFormatted }];
    }
    if (plan === 'monthly' && variantMonthly) {
      return [{ variant_id: parseInt(variantMonthly, 10), quantity: 1, price: amountFormatted }];
    }
    const title =
      plan === 'yearly'
        ? 'Platinum Membership - Yearly'
        : 'Platinum Membership - Monthly';
    return [
      { title, price: amountFormatted, quantity: 1, taxable: false },
    ];
  }

  if (event.type === 'checkout.session.completed') {
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
    const amountFormatted = (amountTotal / 100).toFixed(2);
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
    const utm = {};
    for (const key of utmKeys) {
      const val = session.metadata?.[key];
      if (typeof val === 'string' && val.trim()) utm[key] = val.trim();
    }
    const noteAttributes = [
      { name: 'stripe_session_id', value: sessionId },
      { name: 'plan', value: plan },
    ];
    for (const key of Object.keys(utm)) {
      noteAttributes.push({ name: key, value: utm[key] });
    }
    let note = `Stripe session: ${sessionId}. Plan: ${plan}.`;
    if (Object.keys(utm).length > 0) {
      const utmLine = Object.entries(utm).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      note += ` UTM: ${utmLine}`;
    }
    const payload = {
      line_items: buildLineItems(plan, amountFormatted),
      email: email || undefined,
      note,
      note_attributes: noteAttributes,
    };
    try {
      const result = await createShopifyDraftOrderAndComplete(shopUrl, shopToken, payload);
      if (!result.ok) {
        res.status(500).json({ error: 'Failed to create draft order' });
        return;
      }
    } catch (err) {
      console.error('Shopify request error', err.message);
      res.status(500).json({ error: 'Shopify request failed' });
      return;
    }
    res.status(200).json({ received: true });
    return;
  }

  if (event.type === 'invoice.paid') {
    const invoiceId = event.data.object.id;
    let invoice;
    try {
      invoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ['subscription', 'customer'],
      });
    } catch (err) {
      console.error('Webhook: failed to retrieve invoice', invoiceId, err.message);
      res.status(500).json({ error: 'Failed to retrieve invoice' });
      return;
    }
    if (!invoice.subscription) {
      res.status(200).json({ received: true });
      return;
    }
    if (invoice.amount_paid == null || invoice.amount_paid <= 0) {
      res.status(200).json({ received: true });
      return;
    }
    const billingReasons = ['subscription_cycle', 'subscription_create'];
    if (invoice.billing_reason && !billingReasons.includes(invoice.billing_reason)) {
      res.status(200).json({ received: true });
      return;
    }
    const subscription =
      typeof invoice.subscription === 'object'
        ? invoice.subscription
        : await stripe.subscriptions.retrieve(invoice.subscription);
    let plan = subscription.metadata?.plan;
    if (!plan && subscription.items?.data?.[0]?.price?.id) {
      const priceId = subscription.items.data[0].price.id;
      plan = priceId === priceYearly ? 'yearly' : priceId === priceMonthly ? 'monthly' : 'yearly';
    }
    if (!plan) plan = 'yearly';
    const email =
      invoice.customer_email ||
      (typeof invoice.customer === 'object' && invoice.customer?.email) ||
      null;
    const amountFormatted = ((invoice.amount_paid || 0) / 100).toFixed(2);
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    const noteAttributes = [
      { name: 'stripe_invoice_id', value: invoiceId },
      { name: 'stripe_subscription_id', value: subId || '' },
      { name: 'plan', value: plan },
      { name: 'order_type', value: 'recurring' },
    ];
    const note = `Recurring subscription order. Invoice: ${invoiceId}. Subscription: ${subId || ''}. Plan: ${plan}.`;
    const payload = {
      line_items: buildLineItems(plan, amountFormatted),
      email: email || undefined,
      note,
      note_attributes: noteAttributes,
    };
    try {
      const result = await createShopifyDraftOrderAndComplete(shopUrl, shopToken, payload);
      if (!result.ok) {
        res.status(500).json({ error: 'Failed to create draft order' });
        return;
      }
    } catch (err) {
      console.error('Shopify request error', err.message);
      res.status(500).json({ error: 'Shopify request failed' });
      return;
    }
    res.status(200).json({ received: true });
    return;
  }
};

// Disable body parsing so we can read the raw stream for Stripe signature verification.
module.exports.config = { api: { bodyParser: false } };
