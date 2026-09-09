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
    const html = await page.text();
    assert.match(html, /x402 Reality Inspector/);
    assert.match(html, /href="https:\/\/github\.com\/qiujieLin\/x402-reality-inspector\/issues\/new\?template=x402-case\.yml/);
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

test("testnet paid endpoint returns a real 402 challenge when unpaid", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/paid-testnet`, { method: "POST" });
    assert.equal(response.status, 402);
    const encoded = response.headers.get("payment-required");
    assert.ok(encoded);
    const challenge = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
      accepts?: Array<Record<string, unknown>>;
    };
    assert.ok(Array.isArray(challenge.accepts));
    assert.ok(challenge.accepts.some((item) => item.network === "eip155:5042002" && item.amount === "1000"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
