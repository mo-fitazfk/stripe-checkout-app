# Stripe Checkout with Shopify Integration

A complete full-stack application that processes payments through Stripe and automatically creates orders in Shopify when payments succeed.

## Features

- 🛒 **Stripe Checkout**: Secure payment processing with Stripe
- 🏪 **Shopify Integration**: Automatic order creation in Shopify
- ⚡ **Real-time Webhooks**: Instant order creation on payment success
- 🎨 **Modern UI**: Beautiful React frontend with responsive design
- 🔒 **Secure**: Webhook signature verification and data validation

## Architecture

```
Frontend (React) → Backend (Express) → Stripe API
                                    ↓
                              Shopify API (Webhook)
```

## 🚀 Deployment with Vercel

### **Step 1: Push to GitHub**

1. **Go to [github.com/mo-fitazfk/stripe-shopify-checkout](https://github.com/mo-fitazfk/stripe-shopify-checkout)**
2. **Upload your project files** (drag and drop all files from your local project)
3. **Commit the files**

### **Step 2: Deploy to Vercel**

1. **Go to [vercel.com](https://vercel.com)**
2. **Click "New Project"**
3. **Import from GitHub: `mo-fitazfk/stripe-shopify-checkout`**
4. **Vercel will automatically detect it's a full-stack app**

### **Step 3: Set Environment Variables**

In Vercel dashboard, go to **Settings** → **Environment Variables** and add:

```
STRIPE_SECRET_KEY = your_actual_stripe_secret_key
STRIPE_WEBHOOK_SECRET = your_actual_webhook_secret
SHOPIFY_SHOP_DOMAIN = your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN = your_actual_shopify_token
REACT_APP_STRIPE_PUBLISHABLE_KEY = your_actual_publishable_key
```

### **Step 4: Configure Stripe Webhook**

1. **Go to [Stripe Dashboard](https://dashboard.stripe.com) → Webhooks**
2. **Add endpoint:** `https://your-vercel-app.vercel.app/api/stripe-webhook`
3. **Select events:** `payment_intent.succeeded`, `payment_intent.payment_failed`
4. **Copy the webhook secret** and add it to Vercel environment variables

### **Step 5: Test Your App**

Your app will be live at: `https://your-vercel-app.vercel.app`

## Local Development

### 1. Install Dependencies

```bash
# Install all dependencies (root, server, and client)
npm run install-all
```

### 2. Environment Setup

#### Backend Environment (server/.env)
Copy `server/env.example` to `server/.env` and fill in your credentials:

```bash
cp server/env.example server/.env
```

#### Frontend Environment (client/.env)
Copy `client/env.example` to `client/.env`:

```bash
cp client/env.example client/.env
```

### 3. Run the Application

```bash
# Start both frontend and backend
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## API Endpoints

### Backend API

- `POST /api/create-payment-intent` - Create Stripe payment intent
- `POST /api/stripe-webhook` - Stripe webhook handler
- `GET /api/health` - Health check

### Frontend Routes

- `/` - Checkout page
- `/success` - Payment success page

## How It Works

1. **Customer initiates checkout** on the React frontend
2. **Payment intent is created** via the backend API
3. **Customer completes payment** using Stripe Elements
4. **Stripe sends webhook** to `/api/stripe-webhook` on payment success
5. **Shopify order is created** automatically with payment details
6. **Customer sees success page** with confirmation

## Testing

### Test Cards (Stripe)

- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **3D Secure**: 4000 0025 0000 3155

### Webhook Testing

Use Stripe CLI for local webhook testing:

```bash
# Install Stripe CLI
stripe listen --forward-to localhost:5000/api/stripe-webhook
```

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── App.js         # Main app component
│   │   └── index.js       # Entry point
│   └── package.json
├── server/                 # Express backend
│   ├── index.js           # Main server file
│   ├── package.json
│   └── env.example        # Environment template
└── package.json           # Root package.json
```

## Available Scripts

```bash
# Development
npm run dev              # Start both frontend and backend
npm run server           # Start only backend
npm run client           # Start only frontend

# Production
npm run build            # Build frontend for production
npm start                # Start production server

# Installation
npm run install-all      # Install all dependencies
```

## Security Considerations

- ✅ Webhook signature verification
- ✅ Environment variable protection
- ✅ Input validation and sanitization
- ✅ HTTPS in production
- ✅ CORS configuration

## Support

For issues and questions:
1. Check the troubleshooting section
2. Verify environment variables
3. Check Stripe and Shopify API status
4. Review server logs for errors

## License

MIT License - feel free to use this project for your own applications.