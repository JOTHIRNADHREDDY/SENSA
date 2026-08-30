# SENSA Staging Provisioning Checklist

## 1. REQUIRED INFRASTRUCTURE

### Firebase
- **SERVICE:** Firebase
- **ACCOUNT REQUIRED:** Google Account
- **RESOURCE REQUIRED:** Firebase Project
- **CREDENTIAL REQUIRED:** Firebase Admin SDK Service Account, Client Config
- **SECRET LOCATION:** Cloudflare Worker Secrets
- **PUBLIC CONFIGURATION:** Frontend environment variables
- **PRIVATE CONFIGURATION:** Worker secrets
- **DEPLOYMENT STEP:** Create project, enable Auth, Firestore, Storage, deploy rules
- **VERIFICATION STEP:** Tenant isolation tests, auth tests

### Cloudflare Workers
- **SERVICE:** Cloudflare
- **ACCOUNT REQUIRED:** Cloudflare Account
- **RESOURCE REQUIRED:** Cloudflare Worker, Custom Domain/Subdomain
- **CREDENTIAL REQUIRED:** API Tokens
- **SECRET LOCATION:** Worker secrets
- **PUBLIC CONFIGURATION:** Worker URL
- **PRIVATE CONFIGURATION:** Stripe secrets, Firebase Admin secrets, etc.
- **DEPLOYMENT STEP:** Deploy worker via Wrangler
- **VERIFICATION STEP:** API health checks, endpoint tests

### Stripe TEST MODE
- **SERVICE:** Stripe
- **ACCOUNT REQUIRED:** Stripe Account (Test Mode)
- **RESOURCE REQUIRED:** Test Products, Webhooks
- **CREDENTIAL REQUIRED:** Publishable Key, Secret Key, Webhook Signing Secret
- **SECRET LOCATION:** Cloudflare Worker Secrets (Frontend for Publishable Key)
- **PUBLIC CONFIGURATION:** Publishable Key
- **PRIVATE CONFIGURATION:** Secret Key, Webhook Secret
- **DEPLOYMENT STEP:** Create test products, configure webhook endpoint
- **VERIFICATION STEP:** Checkout, Webhook processing

### Vercel
- **SERVICE:** Vercel
- **ACCOUNT REQUIRED:** Vercel Account linked to GitHub
- **RESOURCE REQUIRED:** Vercel Project linked to `frontend/`
- **CREDENTIAL REQUIRED:** Vercel Access Token (if CLI) or OAuth
- **SECRET LOCATION:** Vercel Project Settings
- **PUBLIC CONFIGURATION:** VITE_* public variables
- **PRIVATE CONFIGURATION:** None in frontend
- **DEPLOYMENT STEP:** Import repository, set framework, set environment variables, deploy
- **VERIFICATION STEP:** HTTPS load, browser console checks

### Firestore
- **SERVICE:** Firebase Firestore
- **ACCOUNT REQUIRED:** Google Account
- **RESOURCE REQUIRED:** Firestore Database
- **CREDENTIAL REQUIRED:** Admin SDK (Server), Client Config (Frontend)
- **SECRET LOCATION:** Cloudflare Worker Secrets (Admin)
- **PUBLIC CONFIGURATION:** Firebase Client Config
- **PRIVATE CONFIGURATION:** Firebase Service Account Key
- **DEPLOYMENT STEP:** Create database, deploy security rules (`firestore.rules`)
- **VERIFICATION STEP:** Tenant isolation

### Stripe Webhooks
- **SERVICE:** Stripe Webhooks
- **ACCOUNT REQUIRED:** Stripe Account
- **RESOURCE REQUIRED:** Webhook Endpoint configured in Stripe Dashboard
- **CREDENTIAL REQUIRED:** Webhook Signing Secret
- **SECRET LOCATION:** Cloudflare Worker Secrets
- **PUBLIC CONFIGURATION:** Webhook URL
- **PRIVATE CONFIGURATION:** Webhook Secret
- **DEPLOYMENT STEP:** Add endpoint in Stripe pointing to Cloudflare Worker
- **VERIFICATION STEP:** Send test webhook from Stripe, check Worker logs


## 2. FIREBASE

### Configuration
Required public frontend configuration:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

*Note: Server-side configuration required by Cloudflare must remain private.*

### Deployment
- Deploy `firestore.rules` for Firestore security.
- Deploy `storage.rules` for Storage security.

### Verification
- [ ] Register
- [ ] Login
- [ ] Logout
- [ ] Password reset
- [ ] Firestore tenant isolation
- [ ] Storage tenant isolation


## 3. CLOUDFLARE

Deploying the Cloudflare Worker from the `cloudflare/` directory.

### Requirements
- Cloudflare account
- Worker environment
- Domain/subdomain
- Worker secrets and bindings

### Secrets Required (Values not printed)
- Firebase Admin Service Account JSON
- Stripe Secret Key
- Stripe Webhook Secret
- Other required API keys (Gemini, Razorpay, etc. if applicable)

### Verification
- [ ] `GET /health`
- [ ] `POST /pricing`
- [ ] `POST /checkout`
- [ ] `POST /organizations`
- [ ] `POST /sites`
- [ ] `POST /cameras`
- [ ] `POST /licenses/activate`
- [ ] `POST /licenses/heartbeat`


## 4. VERCEL

### Deployment details
- **Repository:** GitHub repository
- **Project root:** `frontend/`
- **Build command:** `npm run build`
- **Output directory:** `dist`

### Environment Variables
- Include ONLY required public environment variables.
- **DO NOT** put private Stripe, Firebase Admin, Gemini, Razorpay, or Cloudflare secrets into Vercel frontend variables.

### Verification
- [ ] HTTPS load
- [ ] Browser console clean
- [ ] Frontend → Cloudflare API communication
- [ ] Firebase authentication flow


## 5. STRIPE TEST MODE

### Configuration
- Stripe TEST account
- Publishable key (Public)
- Secret key (Private - Keep server-side)
- Webhook signing secret (Private - Keep server-side)

### Verification
- [ ] Checkout success
- [ ] Checkout failure
- [ ] Checkout cancel
- [ ] Webhook processing
- [ ] Duplicate webhook handling (Idempotency)
- [ ] Invalid signature rejection


## 6. WEBHOOK ENDPOINT

The exact public HTTPS webhook endpoint flow:

`Stripe` → `Cloudflare Worker` → `Signature verification` → `Idempotency` → `Firestore` → `Subscription` → `License`

**Local Testing vs Deployment:** 
For initial local testing, a tunnel (e.g., Cloudflare Tunnel or ngrok) may be used to route Stripe webhooks to the local Wrangler dev server. For staging, the deployed Cloudflare Worker URL will be used directly in the Stripe Dashboard.


## 7. STAGING ENVIRONMENT VARIABLES

| Variable | Component | Public/Private | Required | Purpose |
|---|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | Frontend | Public | Yes | Firebase client initialization |
| `VITE_FIREBASE_AUTH_DOMAIN` | Frontend | Public | Yes | Firebase client initialization |
| `VITE_FIREBASE_PROJECT_ID` | Frontend | Public | Yes | Firebase client initialization |
| `VITE_FIREBASE_STORAGE_BUCKET`| Frontend | Public | Public | Firebase client initialization |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`| Frontend | Public | Yes | Firebase client initialization |
| `VITE_FIREBASE_APP_ID` | Frontend | Public | Yes | Firebase client initialization |
| `VITE_API_BASE_URL` | Frontend | Public | Yes | URL for Cloudflare Worker API |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Frontend | Public | Yes | Stripe Checkout initialization |
| `FIREBASE_ADMIN_CREDENTIALS` | Worker | Private | Yes | Admin access to Firestore/Auth |
| `STRIPE_SECRET_KEY` | Worker | Private | Yes | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | Worker | Private | Yes | Webhook signature verification |


## 8. CREDENTIAL SAFETY

- **CRITICAL:** Credentials must not be committed to Git.
- **CRITICAL:** Credentials must not be placed in frontend source code.
- **CRITICAL:** Credentials must not appear in logs.
- **CRITICAL:** Credentials must not appear in test reports.
- **CRITICAL:** Credentials must not be pasted into public documentation.


## 9. EXECUTION ORDER

1. [ ] Firebase project setup
2. [ ] Deploy Firestore/Storage rules
3. [ ] Deploy Cloudflare Worker code
4. [ ] Configure Cloudflare secrets
5. [ ] Stripe TEST configuration
6. [ ] Configure Webhook endpoint
7. [ ] Vercel project setup
8. [ ] Set Frontend environment variables in Vercel
9. [ ] Deploy frontend
10. [ ] Firebase Auth test
11. [ ] Pricing runtime test
12. [ ] Stripe checkout test
13. [ ] Webhook test
14. [ ] License test
15. [ ] Full customer journey test
