/**
 * Loop subscription sync: create timeless subscription on Stripe purchase, cancel on Stripe cancel.
 * All logic is no-op when LOOP_SYNC_ENABLED is not truthy (easy to turn off in Vercel env).
 */

const LOOP_BASE = process.env.LOOP_API_BASE_URL || 'https://api.loopsubscriptions.com/admin/2023-10';

function isEnabled() {
  const v = process.env.LOOP_SYNC_ENABLED;
  return v === 'true' || v === '1' || v === true;
}

function getAuthHeader() {
  const token = process.env.LOOP_API_TOKEN;
  if (!token) return null;
  return { 'x-loop-token': token };
}

/**
 * Create a Loop subscription for the given Shopify customer (timeless plan, no charge).
 * No-op if LOOP_SYNC_ENABLED is not set. Logs errors; does not throw.
 * @param {string} email - Customer email (for logging)
 * @param {string} [plan] - Plan name (yearly/monthly) for reference
 * @param {string|number} shopifyCustomerId - Shopify customer ID (required by Loop API)
 * @param {string|number} [originOrderShopifyId] - Shopify order ID that originated this subscription (required by Loop when no payment method)
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function createSubscription(email, plan, shopifyCustomerId, originOrderShopifyId) {
  if (!isEnabled()) return { ok: true };
  if (!email || typeof email !== 'string' || !email.trim()) {
    console.warn('Loop: createSubscription skipped, no email');
    return { ok: false, error: 'No email' };
  }
  if (!shopifyCustomerId) {
    console.warn('Loop: createSubscription skipped, no shopifyCustomerId');
    return { ok: false, error: 'No Shopify customer ID' };
  }
  if (!originOrderShopifyId) {
    console.warn('Loop: createSubscription skipped, no originOrderShopifyId');
    return { ok: false, error: 'No origin order ID' };
  }
  const token = getAuthHeader();
  if (!token) {
    console.warn('Loop: LOOP_API_TOKEN not set, skipping create');
    return { ok: false, error: 'No token' };
  }
  const sellingPlanId = process.env.LOOP_SELLING_PLAN_ID;
  if (!sellingPlanId) {
    console.warn('Loop: LOOP_SELLING_PLAN_ID not set, skipping create');
    return { ok: false, error: 'No selling plan ID' };
  }
  const variantId = process.env.LOOP_VARIANT_ID || process.env.LOOP_PRODUCT_VARIANT_ID;
  if (!variantId) {
    console.warn('Loop: LOOP_VARIANT_ID not set, skipping create');
    return { ok: false, error: 'No variant ID' };
  }
  const currencyCode = process.env.LOOP_CURRENCY_CODE || 'AUD';
  // Interpret LOOP_DELIVERY_PRICE as a decimal amount (e.g. "0.00", "5.00") and convert to integer cents
  const deliveryPriceAmount = process.env.LOOP_DELIVERY_PRICE || '0';
  const deliveryPriceParsed = parseFloat(deliveryPriceAmount);
  if (Number.isNaN(deliveryPriceParsed)) {
    console.warn('Loop: LOOP_DELIVERY_PRICE must be a decimal number (e.g. \"0.00\", \"5.00\")');
    return { ok: false, error: 'Invalid LOOP_DELIVERY_PRICE' };
  }
  const deliveryPriceCents = Math.round(deliveryPriceParsed * 100);
  // 10 years from now (timeless plan = no real charge)
  const nextBillingDateEpoch = Math.floor(Date.now() / 1000) + 10 * 365.25 * 24 * 60 * 60;
  const tenYearsPolicy = {
    interval: 'YEAR',
    intervalCount: 10,
    minCycles: null,
    maxCycles: null,
    anchors: null,
  };
  try {
    const customerIdNum = Number(shopifyCustomerId);
    const variantIdNum = Number(variantId);
    const originOrderIdNum = Number(originOrderShopifyId);
    const sellingPlanIdNum = Number(sellingPlanId);
    if (
      Number.isNaN(customerIdNum) ||
      Number.isNaN(variantIdNum) ||
      Number.isNaN(originOrderIdNum) ||
      Number.isNaN(sellingPlanIdNum)
    ) {
      console.warn('Loop: invalid customer, variant, selling plan, or origin order ID');
      return { ok: false, error: 'Invalid ID' };
    }
    // Product has no delivery price in Shopify (normal for digital / requires_shipping: false).
    // Shopify subscription contract still requires a delivery price in the create call; we send deliveryPriceCents.
    // Loop maps this onto Shopify's delivery price field.
    const body = {
      customerShopifyId: customerIdNum,
      originOrderShopifyId: originOrderIdNum,
      nextBillingDateEpoch,
      currencyCode,
      billingPolicy: tenYearsPolicy,
      deliveryPolicy: {
        interval: 'YEAR',
        intervalCount: 10,
      },
      deliveryPrice: deliveryPriceCents,
      lines: [
        {
          variantShopifyId: variantIdNum,
          sellingPlanShopifyId: sellingPlanIdNum,
          quantity: 1,
          price: '0.00',
          requiresShipping: false,
        },
      ],
    };
    if (process.env.LOOP_DEBUG === 'true') {
      console.log('Loop create payload (sanitized)', {
        customerShopifyId: customerIdNum,
        originOrderShopifyId: originOrderIdNum,
        deliveryPrice: deliveryPriceCents,
        currencyCode,
        lineCount: body.lines.length,
      });
    }
    const res = await fetch(`${LOOP_BASE}/subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...token,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Loop createSubscription failed', res.status, text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (err) {
    console.error('Loop createSubscription error', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Cancel Loop subscription(s) for the given customer email.
 * No-op if LOOP_SYNC_ENABLED is not set. Logs errors; does not throw.
 * @param {string} email - Customer email
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function cancelSubscription(email) {
  if (!isEnabled()) return { ok: true };
  if (!email || typeof email !== 'string' || !email.trim()) {
    console.warn('Loop: cancelSubscription skipped, no email');
    return { ok: false, error: 'No email' };
  }
  const token = getAuthHeader();
  if (!token) {
    console.warn('Loop: LOOP_API_TOKEN not set, skipping cancel');
    return { ok: false, error: 'No token' };
  }
  try {
    // Loop: read customer by email to get subscription ID(s), then cancel each.
    // Adjust URL and response path to match your Loop API (see help.loopwork.co).
    const customerRes = await fetch(
      `${LOOP_BASE}/customers?email=${encodeURIComponent(email.trim())}`,
      { headers: token }
    );
    if (!customerRes.ok) {
      console.error('Loop cancelSubscription: customer lookup failed', customerRes.status, await customerRes.text());
      return { ok: false, error: 'Customer lookup failed' };
    }
    const customerData = await customerRes.json();
    // Support common shapes: { subscriptions: [{ id }] }, { subscription_ids: [] }, or nested
    const raw = customerData.subscriptions ?? customerData.subscription_ids ?? customerData.data?.subscriptions ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    const subscriptionIds = list.map((s) => (typeof s === 'object' && s != null ? s.id : s)).filter(Boolean);
    if (subscriptionIds.length === 0) {
      return { ok: true };
    }
    for (const subId of subscriptionIds) {
      const cancelRes = await fetch(`${LOOP_BASE}/subscriptions/${subId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...token },
        body: JSON.stringify({}),
      });
      if (!cancelRes.ok) {
        console.error('Loop cancelSubscription: cancel failed', subId, cancelRes.status, await cancelRes.text());
      }
    }
    return { ok: true };
  } catch (err) {
    console.error('Loop cancelSubscription error', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { createSubscription, cancelSubscription, isEnabled };
