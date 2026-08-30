# New Frontend API Migration Plan

The frontend currently relies on the `sensa-compat` compatibility layer in the Cloudflare Worker to avoid modifying the UI. This document outlines the plan to eventually migrate the frontend components to call the authoritative SENSA APIs directly.

## 1. Get Pricing by Country
**CURRENT ENDPOINT:** `GET /api/pricing/:country` (Compatibility Layer)
**AUTHORITATIVE ENDPOINT:** `POST /api/v1/billing/price` (SENSA Direct API)
**ADAPTER REQUIRED:** The UI currently expects a single GET request that returns *all* plans for a specific country in a structured object (`{ base_license: { ... }, professional: { ... } }`). The authoritative endpoint requires a POST request specifying a `planId` and `billingCycle` to return a single price.
**MIGRATION PRIORITY:** High. The compatibility layer successfully maps the pricing using `determinePrice()`, but moving to the direct API removes the adapter overhead.
**BLOCKERS:** Requires significant refactoring of the `PricingSection.tsx` and `BillingPage.tsx` React components to fire multiple requests or to wait until a user selects a plan before fetching the price.

## 2. Analyze AI Snapshot
**CURRENT ENDPOINT:** `POST /api/analyze-snapshot` (Compatibility Layer)
**AUTHORITATIVE ENDPOINT:** None exists for public demos. SENSA relies on the Windows Agent running YOLOv8 for real analysis, not the cloud backend.
**ADAPTER REQUIRED:** The compatibility layer currently uses `GEMINI_API_KEY` on the edge to simulate an analysis for the landing page demo.
**MIGRATION PRIORITY:** Low. This is specifically a marketing/demo feature for the public landing page.
**BLOCKERS:** The authoritative backend is designed for Edge appliance communication, not browser-based demo uploads. This endpoint should likely remain as a dedicated `/api/v1/demo/analyze-snapshot` marketing endpoint.

## 3. Send WhatsApp Test
**CURRENT ENDPOINT:** `POST /api/send-whatsapp-test` (Compatibility Layer)
**AUTHORITATIVE ENDPOINT:** `POST /api/v1/alerts` (Requires Auth & Edge JWT)
**ADAPTER REQUIRED:** The compatibility layer mocks a delivery response to simulate the speed of the SENSA system for the landing page demo.
**MIGRATION PRIORITY:** Low. Similar to the AI Snapshot, this is a simulated demo for unauthenticated users.
**BLOCKERS:** Real WhatsApp alerts require a configured Twilio/WhatsApp provider and an authenticated user session with a configured camera site. The UI is just a marketing demo. This endpoint should remain as `/api/v1/demo/whatsapp`.
