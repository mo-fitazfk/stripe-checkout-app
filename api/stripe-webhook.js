const Stripe = require('stripe');
const loop = require('./lib/loop');

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

const SHOPIFY_GRAPHQL_API_VERSION = '2024-04';

/**
 * Create a Shopify draft order via GraphQL (supports variant + priceOverride so receipt shows exact product at Stripe price).
 * @param {string} shopUrl - Shop domain without protocol
 * @param {string} shopToken - Shopify Admin API access token
 * @param {object} draftOrderPayload - { line_items: [{ variant_id?, title?, price }], email?, note, note_attributes?, tags?, source_name? }
 * @param {string} currencyCode - e.g. 'AUD'
 * @returns {Promise<{ ok: boolean, error?: string, customerId?: string, orderId?: string, draftOrderId?: string }>}
 */
async function createShopifyDraftOrderAndComplete(shopUrl, shopToken, draftOrderPayload, currencyCode = 'AUD') {
  const graphqlUrl = `https://${shopUrl}/admin/api/${SHOPIFY_GRAPHQL_API_VERSION}/graphql.json`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': shopToken,
  };

  const lineItems = (draftOrderPayload.line_items || []).map((item) => {
    const priceInput = { amount: String(item.price), currencyCode };
    if (item.variant_id != null) {
      return {
        variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
        quantity: item.quantity ?? 1,
        priceOverride: priceInput,
      };
    }
    return {
      title: item.title || 'Subscription',
      quantity: item.quantity ?? 1,
      originalUnitPriceWithCurrency: priceInput,
    };
  });

  const customAttributes = (draftOrderPayload.note_attributes || []).map((attr) => ({
    key: attr.name,
    value: String(attr.value),
  }));

  const tagsInput = draftOrderPayload.tags
    ? (Array.isArray(draftOrderPayload.tags)
        ? draftOrderPayload.tags
        : String(draftOrderPayload.tags).split(',').map((t) => t.trim()).filter(Boolean))
    : null;
  const input = {
    lineItems,
    email: draftOrderPayload.email || null,
    note: draftOrderPayload.note || null,
    customAttributes: customAttributes.length ? customAttributes : null,
    tags: tagsInput,
    sourceName: draftOrderPayload.source_name || null,
  };
  const createMutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { message field }
      }
    }
  `;
  const createRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: createMutation, variables: { input } }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    console.error('Shopify draft order create failed', createRes.status, text);
    return { ok: false, error: text };
  }
  const createJson = await createRes.json();
  const createData = createJson.data?.draftOrderCreate;
  const userErrors = createData?.userErrors || [];
  if (userErrors.length > 0) {
    const msg = userErrors.map((e) => e.message).join('; ');
    console.error('Shopify draftOrderCreate userErrors', msg);
    return { ok: false, error: msg };
  }
  const draftOrderGid = createData?.draftOrder?.id;
  if (!draftOrderGid) {
    return { ok: false, error: 'No draft order id returned' };
  }

  const completeMutation = `
    mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { id order { id legacyResourceId customer { id legacyResourceId } } }
        userErrors { message field }
      }
    }
  `;
  const completeRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: completeMutation, variables: { id: draftOrderGid } }),
  });
  if (!completeRes.ok) {
    const text = await completeRes.text();
    console.error('Shopify draft order complete failed', completeRes.status, text);
    return { ok: false, error: text };
  }
  const completeJson = await completeRes.json();
  const completeData = completeJson.data?.draftOrderComplete;
  const completeErrors = completeData?.userErrors || [];
  if (completeErrors.length > 0) {
    const msg = completeErrors.map((e) => e.message).join('; ');
    console.error('Shopify draftOrderComplete userErrors', msg);
    return { ok: false, error: msg };
  }
  const order = completeData?.draftOrder?.order;
  const orderId = order?.legacyResourceId ?? order?.id ?? null;
  const customerId = order?.customer?.legacyResourceId ?? order?.customer?.id ?? null;
  return {
    ok: true,
    customerId: customerId != null ? String(customerId) : undefined,
    orderId: orderId != null ? String(orderId) : undefined,
  };
}

/**
 * Get Shopify customer ID from an order (for Loop API - customer must be the order's customer).
 * @param {string} shopUrl - Shop domain without protocol
 * @param {string} shopToken - Shopify Admin API access token
 * @param {string} orderId - Shopify order ID
 * @returns {Promise<string|null>} - Customer ID or null
 */
async function getShopifyCustomerIdFromOrder(shopUrl, shopToken, orderId) {
  if (!orderId || !orderId.trim()) return null;
  const url = `https://${shopUrl}/admin/api/2024-04/orders/${orderId}.json`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': shopToken },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const order = data.order;
  if (!order) return null;
  const id = order.customer_id ?? order.customer?.id ?? null;
  return id != null ? String(id) : null;
}

/**
 * Get Shopify customer ID by email (for Loop API customerShopifyId).
 * @param {string} shopUrl - Shop domain without protocol
 * @param {string} shopToken - Shopify Admin API access token
 * @param {string} email - Customer email
 * @returns {Promise<string|null>} - Customer ID or null
 */
async function getShopifyCustomerIdByEmail(shopUrl, shopToken, email) {
  if (!email || !email.trim()) return null;
  const url = `https://${shopUrl}/admin/api/2024-04/customers/search.json?query=${encodeURIComponent('email:' + email.trim())}`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': shopToken },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const customers = data.customers;
  if (!Array.isArray(customers) || customers.length === 0) return null;
  const id = customers[0].id;
  return id != null ? String(id) : null;
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
  const shopifySourceName = process.env.SHOPIFY_SOURCE_NAME || null;
  const shopifyOrderTags = process.env.SHOPIFY_ORDER_TAGS || null;

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

  // Loop sync: cancel subscription when customer cancels in Stripe (no Shopify work)
  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    if (loop.isEnabled()) {
      const sub = event.data.object;
      const status = sub.status;
      const isCanceled = status === 'canceled' || status === 'cancelled' || status === 'unpaid' || status === 'incomplete_expired';
      if (event.type === 'customer.subscription.deleted' || isCanceled) {
        let email = null;
        try {
          if (sub.customer) {
            const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
            const customer = await stripe.customers.retrieve(customerId);
            email = customer.deleted ? null : customer.email;
          }
          if (email) {
            await loop.cancelSubscription(email);
          }
        } catch (err) {
          console.error('Loop: cancel on subscription event failed', err.message);
        }
      }
    }
    res.status(200).json({ received: true });
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

  // Line item display names for receipt (custom line items so these exact names show; product_id/variant_id still in note_attributes).
  const LINE_TITLES = {
    yearly_trial: 'Platinum Membership Yearly - Free Trial',
    monthly_trial: 'Platinum Membership Monthly - Free Trial',
    yearly_paid: 'Platinum Membership Yearly',
    monthly_paid: 'Platinum Membership Monthly (after trial)',
  };

  function buildLineItems(plan, amountFormatted, _metadataVariantId) {
    const isTrial = amountFormatted === '0.00';
    const title =
      plan === 'yearly'
        ? (isTrial ? LINE_TITLES.yearly_trial : LINE_TITLES.yearly_paid)
        : (isTrial ? LINE_TITLES.monthly_trial : LINE_TITLES.monthly_paid);
    return [{ title, price: amountFormatted, quantity: 1 }];
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
    const productId = session.metadata?.product_id ?? '';
    const variantIdMeta = session.metadata?.variant_id ?? '';
    const noteAttributes = [
      { name: 'stripe_session_id', value: sessionId },
      { name: 'plan', value: plan },
    ];
    if (productId) noteAttributes.push({ name: 'product_id', value: productId });
    if (variantIdMeta) noteAttributes.push({ name: 'variant_id', value: variantIdMeta });
    for (const key of Object.keys(utm)) {
      noteAttributes.push({ name: key, value: utm[key] });
    }
    let note = `Stripe session: ${sessionId}. Plan: ${plan}.`;
    if (productId) note += ` Product ID: ${productId}.`;
    if (variantIdMeta) note += ` Variant ID: ${variantIdMeta}.`;
    if (Object.keys(utm).length > 0) {
      const utmLine = Object.entries(utm).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      note += ` UTM: ${utmLine}`;
    }
    const payload = {
      line_items: buildLineItems(plan, amountFormatted, variantIdMeta),
      email: email || undefined,
      note,
      note_attributes: noteAttributes,
    };
    if (shopifyOrderTags) payload.tags = shopifyOrderTags;
    if (shopifySourceName) payload.source_name = shopifySourceName;
    const currencyCode = (session.currency && String(session.currency).toUpperCase()) || 'AUD';
    let shopifyCustomerId = null;
    let shopifyOrderId = null;
    try {
      const result = await createShopifyDraftOrderAndComplete(shopUrl, shopToken, payload, currencyCode);
      if (!result.ok) {
        res.status(500).json({ error: 'Failed to create draft order' });
        return;
      }
      shopifyCustomerId = result.customerId;
      shopifyOrderId = result.orderId;
    } catch (err) {
      console.error('Shopify request error', err.message);
      res.status(500).json({ error: 'Shopify request failed' });
      return;
    }
    if (loop.isEnabled() && email && shopifyOrderId) {
      try {
        // Prefer customer ID from the order (Loop expects the order's customer); fallback to email search
        const customerId =
          shopifyCustomerId ||
          (await getShopifyCustomerIdFromOrder(shopUrl, shopToken, shopifyOrderId)) ||
          (await getShopifyCustomerIdByEmail(shopUrl, shopToken, email));
        if (customerId) {
          await loop.createSubscription(email, plan, customerId, shopifyOrderId);
        } else {
          console.warn('Loop: no Shopify customer ID for order/email, skipping create');
        }
      } catch (err) {
        console.error('Loop createSubscription error', err.message);
      }
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
    const productIdSub = subscription.metadata?.product_id ?? '';
    const variantIdSub = subscription.metadata?.variant_id ?? '';
    const noteAttributes = [
      { name: 'stripe_invoice_id', value: invoiceId },
      { name: 'stripe_subscription_id', value: subId || '' },
      { name: 'plan', value: plan },
      { name: 'order_type', value: 'recurring' },
    ];
    if (productIdSub) noteAttributes.push({ name: 'product_id', value: productIdSub });
    if (variantIdSub) noteAttributes.push({ name: 'variant_id', value: variantIdSub });
    const note = `Recurring subscription order. Invoice: ${invoiceId}. Subscription: ${subId || ''}. Plan: ${plan}.`;
    if (productIdSub) note += ` Product ID: ${productIdSub}.`;
    if (variantIdSub) note += ` Variant ID: ${variantIdSub}.`;
    const payload = {
      line_items: buildLineItems(plan, amountFormatted, variantIdSub),
      email: email || undefined,
      note,
      note_attributes: noteAttributes,
    };
    if (shopifyOrderTags) payload.tags = shopifyOrderTags;
    if (shopifySourceName) payload.source_name = shopifySourceName;
    const currencyCode = (invoice.currency && String(invoice.currency).toUpperCase()) || 'AUD';
    try {
      const result = await createShopifyDraftOrderAndComplete(shopUrl, shopToken, payload, currencyCode);
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
