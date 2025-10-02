const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);

      try {
        // Extract payment data from metadata
        const paymentData = {
          payment_intent_id: paymentIntent.id,
          amount: paymentIntent.amount / 100, // Convert from cents
          currency: paymentIntent.currency,
          customer: paymentIntent.metadata.customer ? JSON.parse(paymentIntent.metadata.customer) : null,
          product_name: paymentIntent.metadata.product_name,
          quantity: parseInt(paymentIntent.metadata.quantity) || 1,
          line_items: paymentIntent.metadata.line_items ? JSON.parse(paymentIntent.metadata.line_items) : null,
        };

        // Create Shopify order
        const orderData = {
          order: {
            line_items: paymentData.line_items || [
              {
                title: paymentData.product_name || 'Product',
                price: paymentData.amount,
                quantity: paymentData.quantity || 1,
              }
            ],
            customer: paymentData.customer ? {
              email: paymentData.customer.email,
              first_name: paymentData.customer.first_name,
              last_name: paymentData.customer.last_name,
            } : undefined,
            financial_status: 'paid',
            fulfillment_status: 'unfulfilled',
            note: `Stripe Payment ID: ${paymentData.payment_intent_id}`,
            tags: 'stripe-payment',
            metafields: [
              {
                namespace: 'stripe',
                key: 'payment_intent_id',
                value: paymentData.payment_intent_id,
                type: 'single_line_text_field'
              }
            ]
          }
        };

        const response = await axios.post(
          `https://${process.env.SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/orders.json`,
          orderData,
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log('Shopify order created:', response.data.order.id);
      } catch (error) {
        console.error('Failed to create Shopify order:', error);
      }
      break;

    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object.id);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};
