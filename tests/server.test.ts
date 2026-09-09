import test from "node:test";
import assert from "node:assert/strict";
import { createInspectorServer } from "../src/server.js";

test("serves health, inspection API, and UI without network verification", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      service: "x402-reality-inspector",
      version: "0.1",
      networkAccess: false,
    });

    const inspection = await fetch(`${base}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "endpoint", data: "https://example.com/paid" }),
    });
    assert.equal(inspection.status, 200);
    assert.equal((await inspection.json()).OVERALL_STATUS, "UNKNOWN");

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /x402 Reality Inspector/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("rejects non-POST inspection requests", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/inspect`);
    assert.equal(response.status, 405);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
