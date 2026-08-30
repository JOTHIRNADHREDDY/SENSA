# SENSA Production Configuration Checklist

This checklist tracks the readiness of all external services required for SENSA production deployment.

## Firebase

| Item | Status | Notes |
|------|--------|-------|
| Firebase Project Created | ⬜ PENDING | Create a dedicated staging/production project |
| Firebase Authentication Enabled | ⬜ PENDING | Enable Email/Password and Google Sign-In |
| Firestore Database Created | ⬜ PENDING | Create in production mode with security rules |
| Firestore Security Rules Deployed | ⬜ PENDING | Deploy `firestore.rules` from repo |
| Firebase Storage Enabled | ⬜ PENDING | For camera snapshots and alert images |
| Service Account Key Generated | ⬜ PENDING | Download JSON key for Cloudflare Workers |

## Cloudflare Workers

| Item | Status | Notes |
|------|--------|-------|
| Cloudflare Account Created | ⬜ PENDING | Workers Paid plan recommended |
| `sensa-api` Worker Created | ⬜ PENDING | Via `wrangler deploy` |
| `FIREBASE_PROJECT_ID` Secret Set | ⬜ PENDING | `wrangler secret put FIREBASE_PROJECT_ID` |
| `FIREBASE_CLIENT_EMAIL` Secret Set | ⬜ PENDING | `wrangler secret put FIREBASE_CLIENT_EMAIL` |
| `FIREBASE_PRIVATE_KEY` Secret Set | ⬜ PENDING | `wrangler secret put FIREBASE_PRIVATE_KEY` |
| `STRIPE_SECRET_KEY` Secret Set | ⬜ PENDING | `wrangler secret put STRIPE_SECRET_KEY` |
| `STRIPE_WEBHOOK_SECRET` Secret Set | ⬜ PENDING | `wrangler secret put STRIPE_WEBHOOK_SECRET` |
| `GEMINI_API_KEY` Secret Set | ⬜ PENDING | `wrangler secret put GEMINI_API_KEY` |
| `TWILIO_ACCOUNT_SID` Secret Set | ⬜ PENDING | `wrangler secret put TWILIO_ACCOUNT_SID` |
| `TWILIO_AUTH_TOKEN` Secret Set | ⬜ PENDING | `wrangler secret put TWILIO_AUTH_TOKEN` |
| `TWILIO_PHONE_NUMBER` Secret Set | ⬜ PENDING | `wrangler secret put TWILIO_PHONE_NUMBER` |
| `ENVIRONMENT` Set to `production` | ✅ DONE | Already set in `wrangler.toml` |
| Rate Limiter Binding Configured | ⬜ PENDING | Configure namespace in Cloudflare Dashboard |
| Custom Domain / Route Configured | ⬜ PENDING | e.g., `api.sensa.io` |

## Stripe

| Item | Status | Notes |
|------|--------|-------|
| Stripe Account Created | ⬜ PENDING | Start in TEST mode |
| Products & Prices Created | ⬜ PENDING | Starter, Basic, Pro plans |
| Webhook Endpoint Registered | ⬜ PENDING | Point to `https://api.sensa.io/api/v1/webhooks/stripe` |
| Webhook Events Selected | ⬜ PENDING | `checkout.session.completed`, `customer.subscription.*` |
| Customer Portal Enabled | ⬜ PENDING | Configure in Stripe Dashboard |
| Switch to LIVE Mode | ⬜ PENDING | Only after staging validation |

## Vercel (Frontend)

| Item | Status | Notes |
|------|--------|-------|
| Vercel Project Created | ⬜ PENDING | Import from Git repo |
| `VITE_FIREBASE_API_KEY` Set | ⬜ PENDING | Vercel Environment Variables |
| `VITE_FIREBASE_AUTH_DOMAIN` Set | ⬜ PENDING | Vercel Environment Variables |
| `VITE_FIREBASE_PROJECT_ID` Set | ⬜ PENDING | Vercel Environment Variables |
| `VITE_FIREBASE_STORAGE_BUCKET` Set | ⬜ PENDING | Vercel Environment Variables |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` Set | ⬜ PENDING | Vercel Environment Variables |
| `VITE_FIREBASE_APP_ID` Set | ⬜ PENDING | Vercel Environment Variables |
| `VITE_API_URL` Set | ⬜ PENDING | Point to Cloudflare Worker URL |
| Custom Domain Configured | ⬜ PENDING | e.g., `app.sensa.io` |

## Twilio

| Item | Status | Notes |
|------|--------|-------|
| Twilio Account Created | ⬜ PENDING | |
| WhatsApp Sandbox or Business Profile | ⬜ PENDING | For WhatsApp alert delivery |
| Phone Number Provisioned | ⬜ PENDING | With WhatsApp capability |

## Google AI (Gemini)

| Item | Status | Notes |
|------|--------|-------|
| Google AI Studio API Key | ⬜ PENDING | For Gemini vision analysis |
| Billing Enabled on Google Cloud | ⬜ PENDING | Required for production usage |
