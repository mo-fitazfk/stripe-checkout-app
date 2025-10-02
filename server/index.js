const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Shopify configuration
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Create Stripe payment intent
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', metadata = {} } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Create Shopify order
const createShopifyOrder = async (paymentData) => {
  try {
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
      `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2023-10/orders.json`,
      orderData,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.order;
  } catch (error) {
    console.error('Error creating Shopify order:', error.response?.data || error.message);
    throw error;
  }
};

// Webhook endpoint for Stripe events
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
        const shopifyOrder = await createShopifyOrder(paymentData);
        console.log('Shopify order created:', shopifyOrder.id);
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
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
