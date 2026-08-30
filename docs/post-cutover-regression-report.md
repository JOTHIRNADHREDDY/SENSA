# SENSA Post-Cutover Regression Report

**Date**: 2026-08-25  
**Purpose**: Verify the frontend/backend API cutover did not reduce test coverage or break previously verified functionality.

---

## Summary

| Category | Status |
|----------|--------|
| Frontend API cutover | ✅ PASS |
| Frontend tests | ✅ PASS — 33 tests (up from 1) |
| Cloudflare tests | ✅ PASS — 18 tests (up from 9) |
| Test coverage | ✅ PASS — 10 → 51 total tests |
| Authentication | ✅ PASS |
| Pricing | ✅ PASS |
| Checkout | ✅ PASS |
| Development fallbacks | ✅ PASS |
| Legacy API cleanup | ✅ PASS |
| Security | ✅ PASS |
| Build | ✅ PASS |
| Agent | ✅ PASS — 14 modules compile |
| External runtime | ⬜ BLOCKED — requires Firebase, Stripe, Twilio, Gemini credentials |

---

## Detailed Results

### Frontend API Cutover — PASS

All 11 frontend `fetch()` calls verified:
- 7 use `/api/v1/*` (current SENSA API)
- 2 use `/api/analyze-snapshot` and `/api/send-whatsapp-test` (compatibility, retained intentionally)
- 0 DEAD endpoints
- 0 BROKEN endpoints
- 2 legacy compat routes (`GET /api/pricing/:country`, `POST /api/pricing/checkout-price`) have zero remaining frontend callers

### Frontend Tests — PASS (33 tests)

| File | Tests | Area |
|------|-------|------|
| `App.test.tsx` | 1 | Framework sanity |
| `tests/countries.test.ts` | 4 | Country dataset integrity |
| `tests/pricing.test.ts` | 18 | Pricing engine, catalog, formatting, mapping |
| `tests/api-contract.test.ts` | 10 | API contract, auth headers, error handling |

### Cloudflare Tests — PASS (18 tests)

| File | Tests | Area |
|------|-------|------|
| `test/auth.test.ts` | 4 | RBAC checkMembership |
| `test/pricing.test.ts` | 5 | determinePrice USD/INR |
| `test/billing.test.ts` | 9 | Billing logic, compat security, routing, edge cases |

### Test Coverage — PASS

- Before: 10 total tests
- After: 51 total tests
- No tests removed, consolidated, or lost
- Coverage increased 5.1×

### Authentication — PASS

All protected frontend API calls include `Authorization: Bearer <JWT>`:
- `GET /api/v1/cameras` ✅
- `GET /api/v1/alerts` ✅
- `POST /api/v1/alerts` ✅
- `PATCH /api/v1/alerts/:id` ✅
- `POST /api/v1/billing/checkout` ✅
- `POST /api/analyze-snapshot` ✅
- `POST /api/send-whatsapp-test` ✅ (fixed during this audit)

Backend `api/index.ts` enforces `verifyAuth()` on all `/api/v1/*` paths except `/api/v1/webhooks`.

### Pricing — PASS

- `PricingSection.tsx` → `POST /api/v1/billing/price` ✅
- `BillingPage.tsx` → `POST /api/v1/billing/price` ✅
- `App.tsx` checkout → `POST /api/v1/billing/checkout` ✅
- Frontend **never sends** the final monetary amount in checkout body ✅

### Checkout — PASS

- Checkout sends `{ countryCode, planId, billingCycle }` only
- Backend `determinePrice()` is authoritative
- Response returns `checkoutSessionUrl` — frontend redirects via `window.location.href`

### Development Fallbacks — PASS

- `SIMULATED_DELIVERY` gated by `env.ENVIRONMENT === 'development'` ✅
- Mock Gemini response gated by `env.ENVIRONMENT === 'development'` ✅
- `wrangler.toml` ENVIRONMENT = `"production"` ✅
- No accidental activation path in production

### Legacy API Cleanup — PASS

| Route | Frontend Callers | Status |
|-------|-----------------|--------|
| `GET /api/pricing/:country` | 0 | Can be removed |
| `POST /api/pricing/checkout-price` | 0 | Can be removed |
| `POST /api/analyze-snapshot` | 2 (AiVisionInspector) | Retained — no v1 equivalent |
| `POST /api/send-whatsapp-test` | 2 (App, AiVisionInspector) | Retained — no v1 equivalent |
| `GET /api/health` | 0 (monitoring) | Retained — health check |

### Security — PASS

No leaked secrets in source code:
- `sk_test_` ❌ Not found
- `sk_live_` ❌ Not found
- `whsec_` ❌ Not found
- `PRIVATE KEY` ❌ Not found in code
- `.env` contains public Firebase client API key (acceptable)

### Build — PASS

| Target | Command | Result |
|--------|---------|--------|
| Frontend tsc | `npx tsc --noEmit` | ✅ Exit 0 |
| Frontend build | `npm run build` | ✅ Exit 0, 2232 modules |
| Frontend tests | `npx vitest run` | ✅ 33 pass, 0 fail |
| Cloudflare tests | `npx vitest run` | ✅ 18 pass, 0 fail |

### Agent — PASS

All 14 Python modules compile successfully:
`__init__`, `main`, `agent_service`, `config/config`, `config/env`, `camera/camera_node`, `camera/onvif_discovery`, `alerts/sender`, `alerts/zone_alert`, `detection/alpr`, `detection/heatmap`, `storage/clip_recorder`, `storage/manager`, `updater/auto_update`

### External Runtime — BLOCKED

All external integration tests remain blocked pending real infrastructure:

| Service | Required For | Status |
|---------|-------------|--------|
| Firebase Auth | JWT verification | ⬜ BLOCKED |
| Firestore | Cameras, alerts, orgs, licenses | ⬜ BLOCKED |
| Stripe | Checkout, portal, webhooks | ⬜ BLOCKED |
| Twilio | WhatsApp delivery | ⬜ BLOCKED |
| Gemini | AI vision analysis | ⬜ BLOCKED |

---

## Regressions Found & Fixed During Audit

| # | Issue | Severity | File | Fix |
|---|-------|----------|------|-----|
| 1 | `handleSendWhatsappTest` in App.tsx had no Authorization header | HIGH | `App.tsx:151` | Added JWT auth |
| 2 | `handleSendWhatsappTest` catch block faked success on error | MEDIUM | `App.tsx:160` | Now shows error message |

---

## What Remains Before Real Staging

1. **Provision Firebase project** — Auth, Firestore, Storage
2. **Deploy Cloudflare Worker** — `wrangler deploy` with all secrets
3. **Configure Stripe** — TEST mode products, webhook endpoint
4. **Configure Twilio** — WhatsApp sandbox or business profile
5. **Configure Gemini** — Google AI Studio API key
6. **Deploy frontend to Vercel** — with Firebase env vars and API URL
7. **Run end-to-end flow** — Registration → Dashboard → Camera → Alert → Checkout
8. **Optionally remove** dead compat routes (`GET /api/pricing/:country`, `POST /api/pricing/checkout-price`)

**This report does NOT declare production readiness.** The application is code-complete and verified at the source level. E2E validation requires real infrastructure.
