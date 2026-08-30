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

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": env.FRONTEND_URL || "https://app.sensa.io",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
      });
    }

    // Public webhooks
    if (path.startsWith("/api/v1/webhooks")) return handleWebhooks(request, env);

    // VASAI Frontend Compatibility Endpoints (Public)
    if (path.startsWith("/api/pricing") || path.startsWith("/api/health") || path.startsWith("/api/analyze-snapshot") || path.startsWith("/api/send-whatsapp-test")) {
      const { handleVasaiCompat } = await import("../sensa-compat");
      return handleVasaiCompat(request, env);
    }

    // Placeholder for Rate Limiting middleware
    if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response(JSON.stringify({ error: "Too Many Requests" }), { 
          status: 429, headers: { "Content-Type": "application/json" } 
        });
      }
    }

    // Verify Auth for protected routes
    const user = await verifyAuth(request);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { "Content-Type": "application/json" } 
      });
    }

    // Attach user to request conceptually (since Request is immutable, we pass it down)
    const ctxRequest = new Request(request.url, request);
    (ctxRequest as any).user = user;

    try {
      if (path.startsWith("/api/v1/auth")) return handleAuth(ctxRequest, env);
      if (path.startsWith("/api/v1/organizations")) return handleOrganizations(ctxRequest, env);
      if (path.startsWith("/api/v1/memberships")) return handleMemberships(ctxRequest, env);
      if (path.startsWith("/api/v1/billing")) return handleBilling(ctxRequest, env);
      if (path.startsWith("/api/v1/licenses")) return handleLicense(ctxRequest, env);
      if (path.startsWith("/api/v1/sites")) return handleSites(ctxRequest, env);
      if (path.startsWith("/api/v1/cameras")) return handleCameras(ctxRequest, env);
      if (path.startsWith("/api/v1/alerts")) return handleAlerts(ctxRequest, env);
      if (path.startsWith("/api/v1/telemetry")) return handleTelemetry(ctxRequest, env);

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
      console.error(e);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  },
};
