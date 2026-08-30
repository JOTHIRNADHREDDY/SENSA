# SENSA Security AI — v1.0

AI-powered CCTV surveillance system with real-time threat detection, zone-based alerts, and commercial licensing.

## Architecture

```text
New Frontend (to be built — separate repository)
         |
         | HTTPS + Firebase ID Token
         v
Backend (Cloudflare Workers / TypeScript)
         |
         +---> Firebase Auth (JWT verification)
         +---> Firestore (database)
         +---> Stripe / Razorpay (payments)
         |
         v
Windows Agent (Python / asyncio)
   - YOLO v8 + OpenCV (AI detection)
   - RTSP camera streams
   - ONVIF discovery
   - Alert submission
   - License heartbeat
```

## Repository Structure

```text
SENSA/
│
├── cloudflare/           # Serverless Edge Backend (Cloudflare Workers)
│   ├── workers/          # API route handlers
│   │   ├── api/          # Main router
│   │   ├── auth/         # Auth verification
│   │   ├── billing/      # Stripe/Razorpay checkout
│   │   ├── cameras/      # Camera management
│   │   ├── alerts/       # Alert ingestion
│   │   ├── license/      # License activation + heartbeat
│   │   ├── organizations/# Organization management
│   │   ├── sites/        # Site management
│   │   ├── telemetry/    # Agent health data
│   │   └── webhooks/     # Stripe webhook handler
│   ├── middleware/       # Firebase JWT auth middleware
│   ├── utils/            # Firestore helper, pricing engine
│   ├── wrangler.toml     # Cloudflare deployment config
│   └── .dev.vars.example # Production secrets template
│
├── firebase/             # Database & Storage Security Rules
│   ├── firestore.rules   # Role-based access control
│   ├── storage.rules     # Storage security
│   ├── firestore.indexes.json
│   └── firebase.json
│
├── agent/                # SENSA Windows Agent (Python)
│   ├── main.py           # Entry point
│   ├── agent_service.py  # Windows Service wrapper
│   ├── camera/           # RTSP + ONVIF discovery
│   ├── detection/        # YOLO, ALPR, heatmap
│   ├── alerts/           # Alert sender + zone logic
│   ├── storage/          # R2/local clip recorder
│   ├── updater/          # Auto-update logic
│   ├── config/           # Cloud config loader
│   └── requirements.txt  # Python deps (YOLO, OpenCV, httpx)
│
├── installer/            # Inno Setup Windows Installer
│   ├── SENSA-Setup-x64.iss
│   └── sensa_activate.pyw
│
├── tests/                # Backend tests
│   └── e2e/              # Pricing engine + license tests
│
├── docs/                 # Documentation
│   ├── api-contract.md          # Complete API reference
│   ├── new-frontend-handoff.md  # New frontend development guide
│   ├── frontend-removal-map.md  # Dependency classification audit
│   └── architecture.md          # System architecture
│
└── README.md
```

## Quick Start

### Cloudflare Worker (Backend API)
```bash
cd cloudflare
npm install
# Copy .dev.vars.example to .dev.vars and add secrets
npx wrangler dev
```

### Firebase Security Rules
```bash
cd firebase
firebase emulators:start --only firestore
```

### Windows Agent
```bash
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# Copy .env.example to .env and configure SENSA_API_URL
python main.py
```

### Backend Tests (Pricing Engine)
```bash
cd tests/e2e
npm install
npm test
```

## Documentation

* [API Contract](docs/api-contract.md) — Complete endpoint reference for frontend development
* [New Frontend Handoff](docs/new-frontend-handoff.md) — Guide for building the new frontend
* [Deployment Guide](docs/deployment.md)

## Backend Independence

The SENSA backend runs **completely independently** of any frontend:

- Cloudflare Worker serves API requests from any HTTP client
- Firebase Auth validates tokens issued to any Firebase SDK consumer
- Windows Agent connects directly to the API using its activation token
- No browser DOM, React, or Vite dependency exists in any backend component

---
© 2026 SENSA Security AI · Peram Jothirnadh Reddy · Ongole, Andhra Pradesh, India  
All rights reserved · SENSA™ Trademark

