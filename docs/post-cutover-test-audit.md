# SENSA Post-Cutover Test Audit

**Date**: 2026-08-25  
**Purpose**: Reconcile test counts and verify no tests were lost during the frontend/backend API cutover.

---

## 1. Test Count Reconciliation

### Before Cutover

| Suite | File | Tests |
|-------|------|-------|
| Frontend | `App.test.tsx` | 1 (framework sanity) |
| Cloudflare | `test/auth.test.ts` | 4 (RBAC checkMembership) |
| Cloudflare | `test/pricing.test.ts` | 5 (determinePrice) |
| **Total** | | **10** |

### After Cutover (Current)

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Frontend | `App.test.tsx` | 1 (framework sanity) | ✅ Retained |
| Frontend | `tests/countries.test.ts` | 4 (dataset integrity) | ✅ **NEW** |
| Frontend | `tests/pricing.test.ts` | 18 (pricing engine, catalog, currency, mapping) | ✅ **NEW** |
| Frontend | `tests/api-contract.test.ts` | 10 (API contract, auth, errors) | ✅ **NEW** |
| Cloudflare | `test/auth.test.ts` | 4 (RBAC checkMembership) | ✅ Retained |
| Cloudflare | `test/pricing.test.ts` | 5 (determinePrice) | ✅ Retained |
| Cloudflare | `test/billing.test.ts` | 9 (billing logic, compat security, routing, edge cases) | ✅ **NEW** |
| **Total** | | **51** | |

### Verdict

- **No tests were removed** during the cutover.
- **No tests were consolidated** — all original tests remain untouched.
- **No tests were accidentally lost.**
- Test count increased from **10 → 51** (5.1× improvement).

---

## 2. Frontend Test Coverage

| Area | Covered | Test File | Details |
|------|---------|-----------|---------|
| Country dataset integrity | ✅ | `countries.test.ts` | 190+ entries, required fields, unique codes, key countries |
| Country-to-region mapping | ✅ | `pricing.test.ts` | US→US, IN→INDIA, DE→EUROPE, XX→DEFAULT |
| Pricing request format | ✅ | `api-contract.test.ts` | POST /api/v1/billing/price with country |
| No client-supplied price | ✅ | `api-contract.test.ts` + `pricing.test.ts` | Checkout body has no amount/price field |
| Authentication headers | ✅ | `api-contract.test.ts` | Authorization: Bearer on cameras, alerts, checkout |
| Protected routes (frontend) | ✅ | `api-contract.test.ts` | Cameras, alerts require auth |
| Billing / checkout request | ✅ | `api-contract.test.ts` | POST /api/v1/billing/checkout with JWT |
| API error handling | ✅ | `api-contract.test.ts` | Network errors, 401, checkout failures |
| Pricing engine functions | ✅ | `pricing.test.ts` | getPricingForCountry, getCheckoutPrice, formatPrice |
| Currency registry | ✅ | `pricing.test.ts` | All currencies have symbol + name |

---

## 3. Cloudflare Test Coverage

| Area | Covered | Test File | Details |
|------|---------|-----------|---------|
| JWT authentication (RBAC) | ✅ | `auth.test.ts` | Exact role, multi-role, wrong role, missing membership |
| Pricing engine | ✅ | `pricing.test.ts` | USD/INR monthly/yearly, unknown country error |
| Billing price endpoint logic | ✅ | `billing.test.ts` | Multi-plan computation, single plan lookup |
| Compatibility security gating | ✅ | `billing.test.ts` | SIMULATED_DELIVERY dev-only, Gemini mock dev-only |
| Auth router path classification | ✅ | `billing.test.ts` | 9 protected paths, 5 public paths verified |
| Pricing edge cases | ✅ | `billing.test.ts` | Region fallback, yearly < 12×monthly |

### Not Yet Covered (Requires External Infrastructure)

| Area | Status | Reason |
|------|--------|--------|
| Organization authorization (Firestore) | ⬜ BLOCKED | Requires live Firestore |
| Webhook signature verification | ⬜ BLOCKED | Requires Stripe webhook secret |
| Webhook idempotency | ⬜ BLOCKED | Requires Stripe event replay |
| License activation | ⬜ BLOCKED | Requires Firestore + Stripe |
| Activation limits | ⬜ BLOCKED | Requires Firestore |
| Checkout session creation | ⬜ BLOCKED | Requires Stripe API key |
| Real WhatsApp delivery | ⬜ BLOCKED | Requires Twilio credentials |
| Real Gemini AI analysis | ⬜ BLOCKED | Requires Gemini API key |

---

## 4. Frontend API Call Classification

Every `fetch()` call in the frontend after cutover:

| File | Endpoint | Classification | Auth | Status |
|------|----------|---------------|------|--------|
| `PricingSection.tsx:30` | `POST /api/v1/billing/price` | CURRENT SENSA API | No (public pricing) | ✅ |
| `BillingPage.tsx:54` | `POST /api/v1/billing/price` | CURRENT SENSA API | No (public pricing) | ✅ |
| `App.tsx:52` | `GET /api/v1/cameras` | CURRENT SENSA API | Yes (JWT) | ✅ |
| `App.tsx:58` | `GET /api/v1/alerts` | CURRENT SENSA API | Yes (JWT) | ✅ |
| `App.tsx:102` | `POST /api/v1/alerts` | CURRENT SENSA API | Yes (JWT) | ✅ |
| `App.tsx:118` | `GET /api/v1/alerts` | CURRENT SENSA API | Yes (JWT) | ✅ |
| `App.tsx:134` | `PATCH /api/v1/alerts/:id` | CURRENT SENSA API | Yes (JWT) | ✅ |
| `App.tsx:153` | `POST /api/send-whatsapp-test` | COMPATIBILITY | Yes (JWT) | ✅ Fixed |
| `App.tsx:298` | `POST /api/v1/billing/checkout` | CURRENT SENSA API | Yes (JWT) | ✅ |
| `AiVisionInspector.tsx:68` | `POST /api/analyze-snapshot` | COMPATIBILITY | Yes (JWT) | ✅ |
| `AiVisionInspector.tsx:133` | `POST /api/send-whatsapp-test` | COMPATIBILITY | Yes (JWT) | ✅ |

**DEAD endpoints**: None.  
**BROKEN endpoints**: None.

### Compatibility Routes Retained

| Route | Reason | Migration Target |
|-------|--------|-----------------|
| `POST /api/analyze-snapshot` | Gemini AI analysis — no `/api/v1/*` equivalent exists yet | Future: `/api/v1/analysis` |
| `POST /api/send-whatsapp-test` | WhatsApp test dispatch — no `/api/v1/*` equivalent exists yet | Future: `/api/v1/notifications/test` |
| `GET /api/health` | Health check — used by monitoring | Retain permanently |
| `GET /api/pricing/:country` | Legacy compat — NO frontend callers remain | Can be removed |
| `POST /api/pricing/checkout-price` | Legacy compat — NO frontend callers remain | Can be removed |

---

## 5. Regressions Found & Fixed

| Issue | File | Severity | Fix |
|-------|------|----------|-----|
| `handleSendWhatsappTest` missing Authorization header | `App.tsx:151` | **HIGH** | Added JWT auth header |
| `handleSendWhatsappTest` catch block faked success on error | `App.tsx:160` | **MEDIUM** | Now shows real error message |

---

## 6. Security Scan Results

| Pattern | Found | Assessment |
|---------|-------|------------|
| `sk_test` | ❌ None | ✅ Clean |
| `sk_live` | ❌ None | ✅ Clean |
| `whsec_` | ❌ None | ✅ Clean |
| `GEMINI_API_KEY` | ✅ In `sensa-compat/index.ts` | ✅ Reference only (reads from `env`) |
| `PRIVATE KEY` | ❌ None | ✅ Clean |
| `FIREBASE_PRIVATE_KEY` | ❌ None in source | ✅ Clean (only in `.dev.vars.example` template) |
| `password=` / `secret=` / `api_key=` | ✅ `.env` has `VITE_FIREBASE_API_KEY` | ✅ Acceptable (public Firebase client key) |

---

## 7. Development Fallback Audit

| Fallback | File | Gating | Production Safe |
|----------|------|--------|----------------|
| `SIMULATED_DELIVERY` | `sensa-compat/index.ts:110` | `env.ENVIRONMENT === 'development'` | ✅ Yes — throws error in production |
| Mock Gemini response | `sensa-compat/index.ts:145` | `env.ENVIRONMENT === 'development'` | ✅ Yes — throws error in production |
| `wrangler.toml` ENVIRONMENT | `wrangler.toml:9` | Set to `"production"` | ✅ Yes |

**No accidental activation paths exist in production.**
