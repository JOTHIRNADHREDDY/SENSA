import { test } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  ApiError,
  humanize,
  post,
  timecode,
} from "../components/types.ts";

test("source timestamp displays minutes without converting to a wall clock", () => {
  assert.equal(timecode(8.5), "00:08");
  assert.equal(timecode(69), "01:09");
  assert.equal(timecode(0), "00:00");
});
test("event names are readable without changing their meaning", () => {
  assert.equal(humanize("zone_entry"), "Zone Entry");
});
test("JSON requests preserve literal user input", () => {
  const input = { question: 'A quote " and a newline\n' };
  assert.deepEqual(JSON.parse(post(input).body as string), input);
});
test("API client propagates backend error messages", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { code: "HTTP_403", message: "Reviewer permission required" },
      }),
      { status: 403 },
    );
  try {
    await assert.rejects(api("/reports/test"), /Reviewer permission required/);
  } finally {
    globalThis.fetch = original;
  }
});
test("API client handles non-JSON outage responses", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Service unavailable", { status: 502 });
  try {
    await assert.rejects(api("/health"), /Request failed \(502\)/);
  } finally {
    globalThis.fetch = original;
  }
});

test("expired sessions are distinguishable from network outages", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { message: "Sign in to continue" } }),
      { status: 401 },
    );
  try {
    await assert.rejects(
      api("/videos"),
      (e: unknown) => e instanceof ApiError && e.status === 401,
    );
  } finally {
    globalThis.fetch = original;
  }
});
