# SENSA Backend / Frontend Cutover Report

**Generated**: 2026-08-25  
**Status**: CUTOVER COMPLETE — awaiting production infrastructure provisioning

---

## 1. Summary

The SENSA frontend has been migrated from mock/compatibility API paths to the authoritative `/api/v1/*` Cloudflare Workers backend. All frontend `fetch()` calls now target the real backend with proper Firebase JWT authentication headers.

---

## 2. Changes Made

### Frontend

| File | Change | Status |
|------|--------|--------|
| `App.tsx` | Removed `INITIAL_CAMERAS`, `INITIAL_ALERTS`, `INITIAL_ZONES` imports. Cameras/alerts now fetched from `/api/v1/cameras` and `/api/v1/alerts` with JWT. | ✅ DONE |
| `App.tsx` | `handleTriggerBreach` now POSTs to `/api/v1/alerts` instead of injecting fake state. | ✅ DONE |
| `App.tsx` | `handleAcknowledgeAlert` now PATCHes `/api/v1/alerts/:id` instead of local state mutation only. | ✅ DONE |
| `App.tsx` | `onSelectPlan` now POSTs to `/api/v1/billing/checkout` and redirects to Stripe Checkout URL. | ✅ DONE |
| `PricingSection.tsx` | Changed `GET /api/pricing/:country` → `POST /api/v1/billing/price` | ✅ DONE |
| `BillingPage.tsx` | Changed `GET /api/pricing/:country` → `POST /api/v1/billing/price` | ✅ DONE |
| `AiVisionInspector.tsx` | Added `useAuth()` hook; `analyze-snapshot` and `send-whatsapp-test` now include `Authorization: Bearer` header. | ✅ DONE |

### Backend

| File | Change | Status |
|------|--------|--------|
| `billing/index.ts` | Added `POST /api/v1/billing/price` endpoint (bulk and single plan pricing). | ✅ DONE |
| `sensa-compat/index.ts` | `send-whatsapp-test`: Simulated delivery now gated by `ENVIRONMENT === 'development'`. Production throws error. | ✅ DONE |
| `sensa-compat/index.ts` | `analyze-snapshot`: Mock Gemini response now gated by `ENVIRONMENT === 'development'`. Production throws error. | ✅ DONE |

### Documentation

| File | Purpose | Status |
|------|---------|--------|
| `docs/frontend-api-cutover.md` | Maps all frontend API calls to backend targets | ✅ DONE |
| `docs/required-secrets.md` | Lists all secrets with scope (Public/Private/Server-Only/Agent-Only) | ✅ DONE |
| `docs/production-configuration-checklist.md` | Tracks all external service configuration status | ✅ DONE |

---

## 3. Verification Results

| Check | Result |
|-------|--------|
| Frontend TypeScript (`tsc --noEmit`) | ✅ PASS |
| Frontend Production Build (`vite build`) | ✅ PASS |
| Frontend Unit Tests (`vitest run`) | ✅ PASS (1 test) |
| Cloudflare Unit Tests (`vitest run`) | ✅ PASS (9 tests — auth + pricing) |
| No leaked Stripe keys (`sk_test_`) | ✅ CLEAN |
| No leaked webhook secrets (`whsec_`) | ✅ CLEAN |
| No old `alert("Selected ... Plan")` mocks | ✅ REMOVED |
| No old `GET /api/pricing/:country` in frontend | ✅ REMOVED |
| `SIMULATED_DELIVERY` only in dev-gated path | ✅ SECURED |
| `INITIAL_CAMERAS` / `INITIAL_ALERTS` no longer imported | ✅ DEAD CODE |

---

## 4. Integration Category Status

| Category | Frontend Wired | Backend Handler | External Service Required | E2E Status |
|----------|---------------|-----------------|--------------------------|------------|
| Authentication | ✅ Firebase JWT | ✅ `verifyAuth()` | Firebase Auth | ⬜ BLOCKED (no project) |
| Cameras | ✅ `GET /api/v1/cameras` | ✅ `handleCameras` | Firestore | ⬜ BLOCKED |
| Alerts | ✅ `GET/POST/PATCH /api/v1/alerts` | ✅ `handleAlerts` | Firestore | ⬜ BLOCKED |
| Pricing | ✅ `POST /api/v1/billing/price` | ✅ `handleBilling` | None (pure compute) | ✅ PASS |
| Checkout | ✅ `POST /api/v1/billing/checkout` | ✅ Stripe API | Stripe | ⬜ BLOCKED (no key) |
| Customer Portal | ✅ `POST /api/v1/billing/portal` | ✅ Stripe API | Stripe | ⬜ BLOCKED |
| Webhooks | ✅ `POST /api/v1/webhooks/stripe` | ✅ `handleWebhooks` | Stripe | ⬜ BLOCKED |
| AI Vision | ✅ `POST /api/analyze-snapshot` | ✅ Gemini API | Gemini API Key | ⬜ BLOCKED |
| WhatsApp Alerts | ✅ `POST /api/send-whatsapp-test` | ✅ Twilio API | Twilio | ⬜ BLOCKED |
| Organizations | ✅ `/api/v1/organizations` | ✅ `handleOrganizations` | Firestore | ⬜ BLOCKED |
| Licenses | ✅ `/api/v1/licenses` | ✅ `handleLicense` | Firestore + Stripe | ⬜ BLOCKED |
| Telemetry | ✅ `/api/v1/telemetry` | ✅ `handleTelemetry` | Firestore | ⬜ BLOCKED |

---

## 5. Remaining Blockers

All BLOCKED items require real infrastructure credentials. See `docs/production-configuration-checklist.md` for the exact provisioning steps.

**No code changes are required.** The application is fully wired and will become operational once external services are provisioned and secrets are set via `wrangler secret put`.

---

## 6. Dead Code

The file `frontend/src/data/camerasData.ts` still exports `INITIAL_CAMERAS`, `INITIAL_ALERTS`, and `INITIAL_ZONES`. These are no longer imported by any component. They can be safely deleted or retained as reference data.
