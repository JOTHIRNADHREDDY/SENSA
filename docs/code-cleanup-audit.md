# SENSA Code Cleanup Audit

This document classifies the files inside the SENSA repository before executing the full cleanup process. 
Any file deleted must be justified.

## Frontend (frontend/)
- `frontend/src/App.tsx` - **REQUIRED** (Main application component)
- `frontend/src/main.tsx` - **REQUIRED** (Entry point)
- `frontend/src/index.css` - **USED** (Global styles, needs unused class purge)
- `frontend/src/types.ts` - **USED** (Types, needs unused type purge)
- `frontend/scripts/seedRegionalPrices.ts` - **DEAD** (Not used in runtime/build)
- `frontend/src/data/camerasData.ts` - **USED** (Contains some DEAD exports)
- `frontend/src/data/pricingCatalog.ts` - **USED** (Contains DEAD `getPriceForRegion` export)
- `frontend/src/lib/firebase.ts` - **USED** (Contains DEAD `handleFirestoreError`, `analytics` exports)
- `frontend/src/components/*.tsx` - **USED** (Needs internal audit for unused hooks/imports)
- `frontend/src/components/*.bak` - **DEAD/OBSOLETE** (Backup files to delete)
- `frontend/package.json` - **REQUIRED** (Needs cleanup of `express`, `dotenv`, duplicate `vite`, `world-countries`)

## Backend API (backend/api/)
- `backend/api/workers/api/index.ts` - **REQUIRED** (Main worker entry point)
- `backend/api/workers/sensa-compat/index.ts` - **USED** (Legacy compat endpoints. Needs code clean for unused/mock logic)
- `backend/api/middleware/auth.ts` - **USED** (Used in `api/index.ts`)
- `backend/api/utils/firestore.ts` - **USED** (Needs internal audit for unused functions like `firestoreDelete`)
- `backend/api/package.json` - **REQUIRED** (Needs cleanup of `@google/genai` if AI simulation is removed)

## Backend Agent (backend/agent/)
- `backend/agent/main.py` - **REQUIRED**
- `backend/agent/camera_stream.py` - **REQUIRED**
- `backend/agent/requirements.txt` - **REQUIRED** (Needs audit)

## Installer (installer/)
- `installer/SENSA-Setup-x64.iss` - **REQUIRED**
- `installer/sensa_activate.pyw` - **REQUIRED**

## Tests & Scripts
- `tests/e2e/auth.test.ts` - **USED**
- `tests/e2e/worker.test.ts` - **USED**
- `frontend/src/tests/*.ts` - **USED**
- `scripts/install.sh` - **USED**
- `scripts/apply_backend_changes.sh` - **OBSOLETE** (We use Wrangler deploy natively now)

## Summary Action Plan
1. Delete `.bak` files.
2. Strip all unused exports and duplicate logic in frontend.
3. Remove unused `package.json` dependencies.
4. Clean up mock endpoints in backend unless explicitly environment gated.
