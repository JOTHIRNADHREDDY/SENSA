import { verifyAuth } from "../../middleware/auth";
import { handleAuth } from "../auth";
import { handleBilling } from "../billing";
import { handleLicense } from "../license";
import { handleOrganizations } from "../organizations";
import { handleMemberships } from "../memberships";
import { handleSites } from "../sites";
import { handleCameras } from "../cameras";
import { handleAlerts } from "../alerts";
import { handleTelemetry } from "../telemetry";
import { handleWebhooks } from "../webhooks";
import { handleDemo } from "../demo";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://sensa-flax.vercel.app",
  "https://app.sensa.io",
  "http://localhost:5173",
  "http://localhost:3000",
];

/** Return CORS headers for the given request origin. */
function getCorsHeaders(request: Request, env: any): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  // Allow any origin listed in the static list, env override, or any *.vercel.app preview deploy
  const allowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin === (env.FRONTEND_URL || "") ||
    origin.endsWith(".vercel.app");

  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/** Attach CORS headers to any Response. */
function withCors(response: Response, corsHeaders: Record<string, string>): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = getCorsHeaders(request, env);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Public webhooks
    if (path.startsWith("/api/v1/webhooks")) return withCors(await handleWebhooks(request, env), corsHeaders);

    // VASAI Frontend Compatibility Endpoints (Public)
    if (path.startsWith("/api/pricing") || path.startsWith("/api/health") || path.startsWith("/api/analyze-snapshot") || path.startsWith("/api/send-whatsapp-test")) {
      const { handleVasaiCompat } = await import("../sensa-compat");
      return withCors(await handleVasaiCompat(request, env), corsHeaders);
    }

    // Placeholder for Rate Limiting middleware
    if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return withCors(new Response(JSON.stringify({ error: "Too Many Requests" }), { 
          status: 429, headers: { "Content-Type": "application/json" } 
        }), corsHeaders);
      }
    }

    // Public auth routes (OTP, registration, etc.)
    const publicAuthRoutes = [
      "/api/v1/auth/check",
      "/api/v1/auth/send-otp",
      "/api/v1/auth/verify-otp",
      "/api/v1/auth/register",
      "/api/v1/auth/link-google"
    ];
    if (publicAuthRoutes.includes(path)) {
      try {
        return withCors(await handleAuth(request, env), corsHeaders);
      } catch (e: any) {
        console.error(e);
        return withCors(new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: { "Content-Type": "application/json" } }), corsHeaders);
      }
    }

    // Verify Auth for protected routes
    const user = await verifyAuth(request, env);
    if (!user) {
      return withCors(new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { "Content-Type": "application/json" } 
      }), corsHeaders);
    }

    // Attach user to request conceptually (since Request is immutable, we pass it down)
    const ctxRequest = new Request(request.url, request);
    (ctxRequest as any).user = user;

    try {
      let response: Response;
      if (path.startsWith("/api/v1/auth")) response = await handleAuth(ctxRequest, env);
      else if (path.startsWith("/api/v1/organizations")) response = await handleOrganizations(ctxRequest, env);
      else if (path.startsWith("/api/v1/memberships")) response = await handleMemberships(ctxRequest, env);
      else if (path.startsWith("/api/v1/billing")) response = await handleBilling(ctxRequest, env);
      else if (path.startsWith("/api/v1/licenses")) response = await handleLicense(ctxRequest, env);
      else if (path.startsWith("/api/v1/sites")) response = await handleSites(ctxRequest, env);
      else if (path.startsWith("/api/v1/cameras")) response = await handleCameras(ctxRequest, env);
      else if (path.startsWith("/api/v1/alerts")) response = await handleAlerts(ctxRequest, env);
      else if (path.startsWith("/api/v1/telemetry")) response = await handleTelemetry(ctxRequest, env);
      else if (path.startsWith("/api/v1/demo")) response = await handleDemo(ctxRequest, env);
      else response = new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });

      return withCors(response, corsHeaders);
    } catch (e: any) {
      console.error(e);
      return withCors(new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: { "Content-Type": "application/json" } }), corsHeaders);
    }
  },
};

