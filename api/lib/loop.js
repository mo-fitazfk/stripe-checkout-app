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
 * Create a Loop subscription for the given email (timeless plan, no charge).
 * No-op if LOOP_SYNC_ENABLED is not set. Logs errors; does not throw.
 * @param {string} email - Customer email
 * @param {string} [plan] - Plan name (yearly/monthly) for reference; Loop uses LOOP_SELLING_PLAN_ID
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function createSubscription(email, plan) {
  if (!isEnabled()) return { ok: true };
  if (!email || typeof email !== 'string' || !email.trim()) {
    console.warn('Loop: createSubscription skipped, no email');
    return { ok: false, error: 'No email' };
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
  try {
    // Loop Merchant API: create subscription. Adjust body to match Loop API docs.
    const body = {
      customer: { email: email.trim() },
      selling_plan_id: sellingPlanId,
      // Add product_id / variant_id here if Loop API requires them (e.g. from env)
    };
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
