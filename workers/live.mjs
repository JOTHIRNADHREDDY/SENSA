// Public frontend assets stay on Cloudflare. The API remains on the owner's computer.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const target = new URL(request.url);
    target.protocol = "http:";
    target.host = "sensa-api.internal";
    try {
      return await env.SENSA_API.fetch(new Request(target, request));
    } catch {
      return new Response(JSON.stringify({ error: { code: "API_UNAVAILABLE", message: "Investigation service is offline" } }), {
        status: 503,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
  },
};
