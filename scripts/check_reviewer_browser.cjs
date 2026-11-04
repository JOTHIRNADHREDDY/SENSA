// Run against the read-only reviewer using Playwright and Chrome from the CI runner.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { chromium } = require("playwright");

async function main() {
  const origin = process.argv[2];
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(new URL(request.url())));
    await page.goto(origin);
    await page.getByText(/Snapshot v8 · 13 episodes · 442 detection records/).waitFor();
    await page.locator("#search").fill("possible_carry");
    await page.getByText("2 of 13 candidate episodes").waitFor();
    await page.getByRole("button", { name: /possible carry.*9\.400/ }).click();
    const atTime = (time) => page.waitForFunction((target) => {
      const player = document.getElementById("player");
      return player.readyState >= 2 && !player.seeking && Math.abs(player.currentTime - target) < 0.075;
    }, time);
    await atTime(9.4);
    await page.locator("#player").evaluate((player) => player.play());
    await page.waitForFunction(() => document.getElementById("player").currentTime > 9.55);
    await page.locator("#player").evaluate((player) => player.pause());

    const tracks = page.locator("#tracks details");
    assert.equal(await tracks.count(), 13);
    await tracks.first().locator("summary").click();
    const sample = tracks.first().getByRole("button").first();
    const sampleTime = Number.parseFloat(await sample.textContent());
    await sample.click();
    await atTime(sampleTime);
    await page.locator("#frame-select").selectOption("2");
    await page.waitForFunction(() => {
      const image = document.querySelector("#frame-inspection img");
      return image?.complete && image.naturalWidth > 0 && image.alt.includes("4.000");
    });
    assert.equal(await page.locator("#frame-inspection rect").count(), 16);
    await page.getByRole("button", { name: "Detection boxes" }).click();
    assert.equal(await page.locator("#frame-inspection rect").count(), 0);
    await page.locator("#frame-inspection summary").click();
    assert.match(await page.locator("#frame-inspection").innerText(), /artifact .*SHA-256.*observation .*run /s);
    assert.match(await page.locator("#comparison").innerText(), /6 → 5.*UNRESOLVED/);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Portable JSON" }).click(),
    ]);
    const json = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.equal(json.id, "45c9e337-8fef-4e49-9588-ccb8561c07c0");
    for (const label of ["Investigation summary", "Technical appendix"]) {
      const path = await page.getByRole("link", { name: label }).getAttribute("href");
      const response = await page.request.get(new URL(path, origin).href);
      assert.equal(response.status(), 200);
      const expected = await readFile(path.slice(1));
      const digest = (data) => createHash("sha256").update(data).digest("hex");
      assert.equal(digest(await response.body()), digest(expected));
    }
    assert.deepEqual(errors, []);
    assert(requests.every((url) => url.origin === origin && !url.pathname.startsWith("/api/")));
    console.log("PASS reviewer browser: search, playback and seeks, tracks, boxes, provenance, JSON download, PDF hashes");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
