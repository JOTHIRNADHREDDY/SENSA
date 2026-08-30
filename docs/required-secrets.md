# SENSA Production Required Secrets & Configuration

This document lists all environment variables required to deploy SENSA to production. 

**WARNING**: Never commit actual secret values to source control.

## Frontend Environment (Vercel / Vite)
*Configured in Vercel Dashboard for the frontend project.*

| Variable | Component | Required | Public/Private | Purpose | Where to Configure |
|----------|-----------|----------|----------------|---------|--------------------|
| `VITE_FIREBASE_API_KEY` | Firebase Client | Yes | Public | Client SDK authentication | `.env` / Vercel |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Client | Yes | Public | Client SDK routing | `.env` / Vercel |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Client | Yes | Public | Client SDK project ID | `.env` / Vercel |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Client | Yes | Public | Client SDK storage access | `.env` / Vercel |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`| Firebase Client | Yes | Public | Client SDK messaging config | `.env` / Vercel |
| `VITE_FIREBASE_APP_ID` | Firebase Client | Yes | Public | Client SDK app identifier | `.env` / Vercel |
| `VITE_API_URL` | Cloudflare Worker | No (Fallback to `/`) | Public | Base URL for backend APIs | `.env` / Vercel |

## Backend Environment (Cloudflare Workers)
*Configured via `wrangler secret put <NAME>` or Cloudflare Dashboard.*

| Variable | Component | Required | Public/Private | Purpose | Where to Configure |
|----------|-----------|----------|----------------|---------|--------------------|
| `FIREBASE_PROJECT_ID` | Firebase Admin | Yes | Server-Only | Backend DB authentication | Wrangler Secret |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin | Yes | Server-Only | Backend DB service account | Wrangler Secret |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin | Yes | Server-Only | Backend DB private key | Wrangler Secret |
| `STRIPE_SECRET_KEY` | Stripe Billing | Yes | Server-Only | Create checkout sessions | Wrangler Secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe Billing | Yes | Server-Only | Validate webhook signatures | Wrangler Secret |
| `TWILIO_ACCOUNT_SID` | Notifications | Yes | Server-Only | WhatsApp/SMS delivery | Wrangler Secret |
| `TWILIO_AUTH_TOKEN` | Notifications | Yes | Server-Only | WhatsApp/SMS auth token | Wrangler Secret |
| `TWILIO_PHONE_NUMBER` | Notifications | Yes | Server-Only | Sender phone number | Wrangler Secret |
| `GEMINI_API_KEY` | AI Analysis | Yes | Server-Only | Process image/text prompts | Wrangler Secret |
| `ENVIRONMENT` | Cloudflare | Yes | Server-Only | Set to `production` or `development` | `wrangler.toml` (vars) |

## Edge Agent (Python)
*Configured on the physical Edge Appliance.*

| Variable | Component | Required | Public/Private | Purpose | Where to Configure |
|----------|-----------|----------|----------------|---------|--------------------|
| `SENSA_LICENSE_KEY` | License | Yes | Agent-Only | Authenticate to SENSA API | Local `.env` on appliance |
| `SENSA_API_URL` | Cloudflare | Yes | Agent-Only | Cloudflare backend URL | Local `.env` on appliance |
