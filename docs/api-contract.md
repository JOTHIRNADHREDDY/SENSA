# SENSA API Contract

This document outlines the authoritative API contract for the SENSA backend, running on Cloudflare Workers and Firebase.

## Base URL
Production: `https://api.sensa.io` (or specific Cloudflare Worker route)
All routes are prefixed with `/api/v1`

## Authentication
Unless otherwise specified, all endpoints require a Bearer token in the `Authorization` header:
`Authorization: Bearer <Firebase_RS256_JWT>`

The token is validated by the Cloudflare Worker using Google's public JWKS.

---

## Organizations
| Method | Path | Required Role | Description |
|---|---|---|---|
| POST | `/organizations` | Authenticated | Create a new organization and become owner. |
| GET | `/organizations` | Authenticated | List all organizations the user is a member of. |
| GET | `/organizations/:id` | Owner, Admin, Operator, Viewer | Get specific organization details. |
| PATCH | `/organizations/:id` | Owner, Admin | Update organization settings. |
| DELETE| `/organizations/:id` | Owner | Delete organization and all related resources. |

---

## Memberships
| Method | Path | Required Role | Description |
|---|---|---|---|
| POST | `/memberships` | Owner, Admin | Add a user to an organization with a specific role (`admin`, `operator`, `viewer`). |
| GET | `/memberships?organizationId=XYZ` | Owner, Admin, Operator, Viewer | List members of an organization. |
| DELETE| `/memberships/:id` | Owner, Admin (or self) | Remove a user from an organization. |

---

## Sites
| Method | Path | Required Role | Description |
|---|---|---|---|
| POST | `/sites` | Owner, Admin | Create a new site within an organization. |
| GET | `/sites?organizationId=XYZ` | Owner, Admin, Operator, Viewer | List sites within an organization. |
| GET | `/sites/:id` | Owner, Admin, Operator, Viewer | Get specific site details. |
| PUT | `/sites/:id` | Owner, Admin | Update site settings (name, timezone). |
| DELETE| `/sites/:id` | Owner, Admin | Delete site and all associated cameras/alerts. |

---

## Cameras
| Method | Path | Required Role | Description |
|---|---|---|---|
| POST | `/cameras` | Owner, Admin | Add a new camera to a site. |
| GET | `/cameras?siteId=XYZ` | Owner, Admin, Operator, Viewer | List cameras in a site. (RTSP URL filtered out for Operator/Viewer). |
| GET | `/cameras/:id` | Owner, Admin, Operator, Viewer | Get specific camera details. |
| PUT | `/cameras/:id` | Owner, Admin | Update camera configuration (RTSP URL, enabled). |
| DELETE| `/cameras/:id` | Owner, Admin | Remove a camera. |

---

## Alerts
| Method | Path | Required Role | Description |
|---|---|---|---|
| POST | `/alerts` | Authenticated (Agent Token) | Report a new security alert from an edge node. Triggers Twilio notifications. |
| GET | `/alerts?cameraId=XYZ` | Owner, Admin, Operator, Viewer | List alerts for a specific camera. |
| PATCH | `/alerts/:id` | Owner, Admin, Operator | Acknowledge or update an alert status. |

---

## Telemetry
| Method | Path | Required Role | Description |
|---|---|---|---|
| POST | `/telemetry` | Authenticated (Agent Token) | Report edge node health and metrics. |
| GET | `/telemetry?installationId=XYZ` | Owner, Admin, Operator, Viewer | Retrieve health metrics for an edge node installation. |

---

## Licenses & Billing
| Method | Path | Required Role | Description |
|---|---|---|---|
| GET | `/licenses?organizationId=XYZ` | Owner, Admin | List active licenses and subscriptions for the org. |
| POST | `/licenses/activate` | Authenticated | Activate an edge node using a license key. (Uses Firestore Transactions to enforce concurrency limits). |
| POST | `/licenses/heartbeat` | Authenticated (Agent) | Edge node periodic check-in to maintain active license state. |
| PATCH | `/licenses/:id` | Owner, Admin | Update license status (e.g. suspend/revoke). |
| POST | `/billing/checkout` | Authenticated | Generate a Stripe Checkout Session for a new subscription plan. |
| POST | `/billing/portal` | Authenticated | Generate a Stripe Customer Portal link to manage active subscriptions. |

---

## Rate Limiting
All core API routes are subject to a global rate limit of 100 requests per minute per IP address, enforced by Cloudflare Workers Rate Limiting middleware. Returns `429 Too Many Requests`.
