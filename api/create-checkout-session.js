const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const priceYearly = process.env.STRIPE_PRICE_YEARLY;
  const priceMonthly = process.env.STRIPE_PRICE_MONTHLY;

  if (!stripeSecretKey || !priceYearly || !priceMonthly) {
    res.status(500).json({ error: 'Server missing Stripe configuration' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const plan = body.plan;
  if (plan !== 'yearly' && plan !== 'monthly') {
    res.status(400).json({ error: 'Invalid plan. Use "yearly" or "monthly".' });
    return;
  }

  const priceId = plan === 'yearly' ? priceYearly : priceMonthly;
  const planName = plan === 'yearly' ? 'Yearly' : 'Monthly';

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-09-30.clover' });

  const origin = req.headers.origin || req.headers.referer || 'https://localhost:3000';
  const baseUrl = origin.replace(/\/$/, '');
  const returnUrl = `${baseUrl}/?session_id={CHECKOUT_SESSION_ID}&success=1`;

  try {
    const price = await stripe.prices.retrieve(priceId);
    const unitAmount = price.unit_amount;
    const currency = (price.currency || 'aud').toLowerCase();
    const interval = price.recurring && price.recurring.interval ? price.recurring.interval : (plan === 'yearly' ? 'year' : 'month');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'custom',
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: planName,
              images: [],
            },
            unit_amount: unitAmount,
            recurring: { interval },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
      },
      return_url: returnUrl,
      metadata: { plan },
    });

    res.status(200).json({ client_secret: session.client_secret, return_url: returnUrl });
  } catch (err) {
    console.error('Stripe session create error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
};
