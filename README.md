# Stripe Checkout — Choose Plan (EvolveYou-style)

Two-step checkout on one page: choose plan (Yearly/Monthly, 7-day trial) then payment with Stripe **Checkout Sessions (custom UI)** and the **Payment Element**. No Stripe-hosted iframe—only your summary and the payment form. No login required. Successful payments are sent to Shopify as draft orders. **Both** the initial purchase and every **recurring** subscription charge (first post-trial charge and each renewal) create a completed order in Shopify.

## Deploy on Vercel

1. Push this folder to GitHub (e.g. repo `stripe-checkout-app`).
2. Import the repo in [Vercel](https://vercel.com) and deploy.
3. Set **Environment Variables** in the Vercel project:
   - `STRIPE_SECRET_KEY` — Stripe secret key (Dashboard → Developers → API keys).
   - `STRIPE_PUBLISHABLE_KEY` or `REACT_APP_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key (same page).
   - `STRIPE_PRICE_YEARLY` — Price ID for yearly plan (e.g. `price_1T2jJs3V2tbgr2nYsLkyGNnU`).
   - `STRIPE_PRICE_MONTHLY` — Price ID for monthly plan (from your Platinum Membership product).
   - `STRIPE_WEBHOOK_SECRET` — From Stripe Dashboard → Webhooks → Add endpoint → select `checkout.session.completed` and `invoice.paid` → use the signing secret.
   - `SHOPIFY_ACCESS_TOKEN` — Shopify Admin API access token (e.g. custom app with `write_draft_orders` scope).
   - `SHOPIFY_SHOP_DOMAIN` — Your shop domain (e.g. `your-store.myshopify.com`).
   - Optional: `SHOPIFY_VARIANT_YEARLY`, `SHOPIFY_VARIANT_MONTHLY` — Shopify **variant** IDs so draft orders use your real products. Example: yearly variant `45218342797498`, monthly variant `45163711070394`. If omitted, draft orders use custom line items (title + price from Stripe). Draft orders appear in **Shopify Admin → Orders → Draft orders**.
   - Optional: `GA_MEASUREMENT_ID` or `GOOGLE_ANALYTICS_MEASUREMENT_ID` — Google Analytics 4 measurement ID (e.g. `G-XXXXXXXXXX`). When set, the app loads gtag.js and sends GA4 events (see below).

4. After deploy, open your Vercel URL. Step 1: choose plan → Continue. Step 2: your selection summary + Stripe Payment Element + Confirm Purchase button. Back link returns to Step 1.

## Hide “Save my information” / fast checkout

The app uses `payment_method_types: ['card']` only (no Link). If a “Save my information” or fast-checkout block still appears (email, phone, full name), **disable Link** in [Stripe Dashboard → Settings → Payment methods → Link](https://dashboard.stripe.com/settings/payment_methods) by turning Link off for this integration.

## Express Checkout (Apple Pay, Google Pay)

The Payment Element shows card and—when enabled in the Dashboard—Apple Pay and Google Pay. To show Apple Pay and Google Pay:

- **Stripe Dashboard:** [Settings → Payment methods](https://dashboard.stripe.com/settings/payment_methods) — enable Apple Pay and Google Pay if needed.
- **Apple Pay:** Register your domain in [Stripe Dashboard → Settings → Payment methods → Apple Pay](https://dashboard.stripe.com/settings/payment_methods). Use your live domain (e.g. `stripe-checkout-app.vercel.app`). Once enabled, the domain appears as a payment method domain (e.g. `pmd_...`) in the Dashboard.
- **Google Pay:** No domain registration in Stripe; ensure it’s enabled in Payment methods. Buttons appear when the customer’s browser/device supports them.

If you prefer Stripe to choose payment methods automatically, remove `payment_method_types` from `api/create-checkout-session.js` and manage methods in the Dashboard only.

## Google Analytics 4 (GA4)

If `GA_MEASUREMENT_ID` (or `GOOGLE_ANALYTICS_MEASUREMENT_ID`) is set in Vercel, the app fetches it from `/api/config` and loads GA4. Events sent:

| Event | When |
|-------|------|
| `page_view` | Automatic on load (via `gtag('config', id)`). |
| `select_plan` | User selects Yearly or Monthly (params: `plan`). |
| `begin_checkout` | User clicks Continue and reaches the payment step (params: `plan`, `currency`). |
| `add_payment_info` | Payment Element is mounted (params: `plan`, `currency`). |
| `purchase` | User completes payment, before redirect (params: `transaction_id`, `plan`, `currency`, `value`). |
| `back_to_plan` | User clicks Back from the payment step (params: `from`). |

Get your measurement ID from [Google Analytics](https://analytics.google.com) → Admin → Data streams → your web stream → Measurement ID (e.g. `G-XXXXXXXXXX`).

## Webhook (send purchase and recurring orders to Shopify)

After deploy, in **Stripe Dashboard → Developers → Webhooks**, add an endpoint:

- **URL:** `https://<your-vercel-domain>/api/stripe-webhook`
- **Events:** `checkout.session.completed`, **`invoice.paid`**

Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in Vercel.

- **Initial purchase:** When a customer completes checkout, the webhook handles `checkout.session.completed` and creates a draft order in Shopify (customer email, line item from plan, note with Stripe session ID and UTM). The draft order is then completed so it appears as a full order.
- **Recurring charges:** When a subscription renews (or the first charge after trial), Stripe sends `invoice.paid`. The webhook creates a Shopify draft order for that invoice when it is for a subscription, has a positive amount, and `billing_reason` is `subscription_cycle` or `subscription_create`. Recurring orders are tagged in Shopify with `order_type: recurring`, `stripe_invoice_id`, and `stripe_subscription_id` in note_attributes so you can filter and reconcile.

**Set `SHOPIFY_VARIANT_YEARLY` and `SHOPIFY_VARIANT_MONTHLY`** in Vercel so draft orders use your Shopify product variants; otherwise they use a custom line item. View orders in **Shopify Admin → Orders**. For signature verification to work, the endpoint must receive the raw request body. If your stack parses the body by default, you may need to disable body parsing for this route (see [Vercel: raw body](https://vercel.com/guides/how-do-i-get-the-raw-body-of-a-serverless-function)).

## Optional: Link from Shopify

Point your Shopify choose-plan page or CTA to your Vercel app URL (e.g. `https://your-app.vercel.app`) so customers use this flow.

## Local dev

```bash
npm install
npx vercel dev
```

Open the URL shown (e.g. http://localhost:3000). Set the same env vars in `.env` or Vercel CLI.

For local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe-webhook`, then use the CLI’s webhook signing secret as `STRIPE_WEBHOOK_SECRET`. Test initial purchase with `stripe trigger checkout.session.completed` and recurring with `stripe trigger invoice.paid`.
