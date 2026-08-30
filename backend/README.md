# SENSA Backend

The SENSA backend is composed of three components:

```
backend/
├── api/          → Cloudflare Workers (TypeScript) — REST API
├── agent/        → Python on-device agent — camera detection & alerts
└── firebase/     → Firestore rules, indexes, and storage rules
```

---

## 1. API (`backend/api/`)

The REST API runs as **Cloudflare Workers** and handles all cloud-side operations:
authentication, billing, cameras, alerts, organizations, memberships, sites, licensing, telemetry, webhooks, and notifications.

### Architecture

- **Entry point**: `workers/api/index.ts` — main router
- **Middleware**: `middleware/auth.ts` — Firebase JWT verification via Web Crypto API
- **Utilities**: `utils/` — Firestore REST client, auth helpers, pricing logic
- **Workers**: `workers/` — 13 route handlers (alerts, auth, billing, cameras, license, memberships, notifications, organizations, sensa-compat, sites, telemetry, webhooks)

### Local Development

```bash
cd backend/api
npm install
npx wrangler dev
# → API available at http://127.0.0.1:8787
```

The frontend Vite dev server proxies `/api` requests to `http://127.0.0.1:8787`.

### Deployment

```bash
cd backend/api
npx wrangler deploy
```

### Environment Variables

Copy `.dev.vars.example` to `.dev.vars` for local development:

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RAZORPAY_KEY_ID` | Razorpay key (optional) |
| `RAZORPAY_KEY_SECRET` | Razorpay secret (optional) |

---

## 2. Agent (`backend/agent/`)

The on-device **Python agent** runs on Windows machines (as a service or standalone). It handles:
- Camera stream processing (RTSP/ONVIF)
- AI-powered object detection (YOLOv8)
- Alert generation & delivery
- Clip recording & cloud sync
- Auto-updates & heartbeats

### Running Locally

```bash
cd backend/agent
pip install -r requirements.txt
python main.py
```

### Running as a Windows Service

```bash
python agent_service.py install
python agent_service.py start
```

### Environment Variables

Copy `.env.example` to `.env`:

| Variable | Description |
|----------|-------------|
| `SENSA_API_URL` | Backend API URL (e.g., `https://api.sensa.io`) |

---

## 3. Firebase (`backend/firebase/`)

Firestore security rules, storage rules, and indexes.

### Deployment

```bash
cd backend/firebase
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## How the Frontend Connects

The **frontend** (`frontend/`) connects to the API through:

1. **Development**: Vite dev server proxies `/api` → `http://127.0.0.1:8787` (configured in `frontend/vite.config.ts`)
2. **Production**: Requests go directly to `https://api.sensa.io` (set via `VITE_API_URL` env var)

All API calls from the frontend use relative paths like `/api/v1/billing/price`, `/api/v1/cameras`, etc.
