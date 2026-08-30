# Frontend API Cutover Inventory

This document maps all current mock/compatibility API paths used by the SENSA frontend to their authoritative backend targets.

| Current Path | Target Path | Auth Required | Current Source | Target Backend Handler | Status |
|--------------|-------------|---------------|----------------|------------------------|--------|
| `GET /api/pricing/:country` | `POST /api/v1/billing/price` | No | `PricingSection.tsx`, `BillingPage.tsx` | Cloudflare `api/index.ts` (Billing Router) | MIGRATE |
| `POST /api/pricing/checkout-price` | `POST /api/v1/billing/price` | No | `pricingEngine.ts` | Cloudflare `api/index.ts` (Billing Router) | MIGRATE |
| `POST /api/analyze-snapshot` | `POST /api/analyze-snapshot` (Compat) | Yes | `AiVisionInspector.tsx` | Cloudflare `sensa-compat/index.ts` | KEEP & SECURE |
| `POST /api/send-whatsapp-test` | `POST /api/send-whatsapp-test` (Compat) | Yes | `App.tsx`, `AiVisionInspector.tsx` | Cloudflare `sensa-compat/index.ts` | KEEP & SECURE |
| Simulated `Checkout` Alert | `POST /api/v1/billing/checkout` | Yes | `App.tsx`, `PricingSection.tsx`, `pricingEngine.ts` | Cloudflare `billing/index.ts` | MIGRATE |
| Simulated Alerts State | `GET /api/v1/alerts` & `POST /api/v1/alerts`| Yes | `App.tsx` (handleTriggerBreach) | Cloudflare `alerts/index.ts` | MIGRATE |
| Simulated Cameras State | `GET /api/v1/cameras` | Yes | `App.tsx` (INITIAL_CAMERAS) | Cloudflare `cameras/index.ts` | MIGRATE |
| Direct Firestore SDK | `GET /api/v1/billing/portal` | Yes | `BillingPage.tsx` (invoices) | Cloudflare `billing/index.ts` | MIGRATE |
| Direct Firestore SDK | `GET /api/v1/licenses` | Yes | `BillingPage.tsx` (subscriptions) | Cloudflare `license/index.ts` | MIGRATE |

## Notes
- Fake checkout alert flows will be strictly replaced by real Stripe checkout session endpoints.
- Simulated delivery responses from `send-whatsapp-test` will throw errors if run in production mode without Twilio configured.
- Static mock camera/alert initial states will be replaced by loading authenticated datasets.
