import assert from "node:assert/strict";
import test from "node:test";
import worker from "../workers/live.mjs";

test("live Worker serves dashboard assets and forwards authenticated API requests", async () => {
  const seen = [];
  const env = {
    ASSETS: { fetch: async (request) => { seen.push(["asset", request.url]); return new Response("dashboard"); } },
    SENSA_API: { fetch: async (request) => {
      seen.push(["api", request.url, request.headers.get("origin"), request.headers.get("cookie"), await request.text()]);
      return new Response("ok", { status: 201, headers: { "set-cookie": "sensa_session=opaque; Secure; HttpOnly" } });
    } },
  };
  const origin = "https://sensa.example.workers.dev";
  const page = await worker.fetch(new Request(origin + "/"), env);
  assert.equal(await page.text(), "dashboard");
  const api = await worker.fetch(new Request(origin + "/api/cases?limit=2", {
    method: "POST", headers: { origin, cookie: "sensa_session=opaque" }, body: "example",
  }), env);
  assert.equal(api.status, 201);
  assert.match(api.headers.get("set-cookie"), /HttpOnly/);
  assert.deepEqual(seen, [
    ["asset", origin + "/"],
    ["api", "http://sensa-api.internal/api/cases?limit=2", origin, "sensa_session=opaque", "example"],
  ]);
});

test("live Worker reports an offline private API", async () => {
  const response = await worker.fetch(new Request("https://sensa.example.workers.dev/api/health"), {
    SENSA_API: { fetch: async () => { throw new Error("private tunnel unavailable"); } },
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "API_UNAVAILABLE");
});
