const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('create-portal-session: missing STRIPE_SECRET_KEY');
    res.status(500).json({ error: 'Portal not configured' });
    return;
  }

  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    res.status(400).json({ error: 'Missing session_id' });
    return;
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-09-30.clover' });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId.trim());
  } catch (err) {
    console.error('create-portal-session: retrieve session failed', err.message);
    res.status(400).json({ error: 'Invalid session' });
    return;
  }

  if (session.mode !== 'subscription') {
    res.status(400).json({ error: 'Session is not a subscription' });
    return;
  }

  const customerId = session.customer;
  if (!customerId) {
    res.status(400).json({ error: 'No customer for this session' });
    return;
  }

  const origin = req.headers.origin || req.headers.referer || 'https://localhost:3000';
  const returnUrl = origin.replace(/\/$/, '') + '/?portal=1';

  let portalSession;
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  } catch (err) {
    console.error('create-portal-session: portal create failed', err.message);
    res.status(500).json({ error: 'Failed to create portal session' });
    return;
  }

  if (portalSession && portalSession.url) {
    res.redirect(302, portalSession.url);
    return;
  }

  res.status(500).json({ error: 'No portal URL' });
};
