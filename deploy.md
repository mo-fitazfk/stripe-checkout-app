# Deployment Guide

## 🚀 Quick Deployment Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Set Environment Variables in Vercel Dashboard:**
   - Go to your project settings
   - Add all variables from `server/env.example`
   - Add `REACT_APP_STRIPE_PUBLISHABLE_KEY` from `client/env.example`

4. **Configure Webhook URL:**
   - Update Stripe webhook endpoint to: `https://your-app.vercel.app/api/stripe-webhook`

### Option 2: Railway

1. **Connect GitHub repository to Railway**
2. **Set environment variables in Railway dashboard**
3. **Deploy automatically**

### Option 3: Heroku

1. **Install Heroku CLI:**
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   
   # Or download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Login and create app:**
   ```bash
   heroku login
   heroku create your-app-name
   ```

3. **Set environment variables:**
   ```bash
   heroku config:set STRIPE_SECRET_KEY=your_key
   heroku config:set STRIPE_WEBHOOK_SECRET=your_webhook_secret
   heroku config:set SHOPIFY_SHOP_DOMAIN=fitazfk.myshopify.com
   heroku config:set SHOPIFY_ACCESS_TOKEN=your_token
   heroku config:set REACT_APP_STRIPE_PUBLISHABLE_KEY=your_publishable_key
   ```

4. **Deploy:**
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

### Option 4: DigitalOcean App Platform

1. **Connect GitHub repository**
2. **Configure build settings:**
   - Build command: `npm run build`
   - Run command: `cd server && npm start`
3. **Set environment variables**
4. **Deploy**

## 🔧 Environment Variables for Production

Make sure to set these in your hosting platform:

### Backend Variables:
```
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token_here
PORT=5000
NODE_ENV=production
```

### Frontend Variables:
```
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
```

## 🔗 Webhook Configuration

After deployment, update your Stripe webhook:

1. **Go to Stripe Dashboard → Webhooks**
2. **Update endpoint URL to:** `https://your-domain.com/api/stripe-webhook`
3. **Select events:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. **Copy the webhook signing secret to your environment variables**

## 🧪 Testing Production

1. **Test with Stripe test cards:**
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`

2. **Check webhook delivery in Stripe dashboard**

3. **Verify Shopify order creation**

## 📊 Monitoring

- **Stripe Dashboard:** Monitor payments and webhooks
- **Shopify Admin:** Check order creation
- **Hosting Platform:** Monitor server logs and performance

## 🚨 Important Notes

- ⚠️ **Use HTTPS in production** (most platforms provide this automatically)
- ⚠️ **Never commit `.env` files** to version control
- ⚠️ **Test webhooks thoroughly** before going live
- ⚠️ **Monitor error logs** for any issues
