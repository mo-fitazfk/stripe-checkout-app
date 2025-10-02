# Stripe Checkout with Shopify Integration

A React frontend with Stripe checkout that automatically creates orders in Shopify.

## 🚀 Quick Deploy to Vercel

1. **Import from GitHub**: `mo-fitazfk/stripe-checkout-app`
2. **Framework Preset**: `Create React App`
3. **Root Directory**: `./`
4. **Build Command**: `cd client && npm run build`
5. **Output Directory**: `client/build`
6. **Install Command**: `npm install && cd client && npm install`

## ⚙️ Environment Variables

Add these in Vercel dashboard:

```
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_token
REACT_APP_STRIPE_PUBLISHABLE_KEY=your_publishable_key
```

## 🔗 API Endpoints

- `/api/create-payment-intent` - Create Stripe payment
- `/api/stripe-webhook` - Stripe webhook handler
- `/api/health` - Health check

## 🎯 How It Works

1. Customer fills checkout form
2. Payment processed with Stripe
3. Webhook creates Shopify order automatically
4. Customer sees success page

## 🧪 Test Cards

- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002