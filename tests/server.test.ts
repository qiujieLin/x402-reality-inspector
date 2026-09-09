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
    assert.match(html, /href="\/.well-known\/x402-reality-inspector\.json"/);
    assert.match(html, /Machine-readable service metadata/);
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

test("serves machine-readable agent discovery metadata", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/.well-known/x402-reality-inspector.json`);
    assert.equal(response.status, 200);
    const metadata = await response.json() as {
      service?: string;
      endpoints?: Record<string, { path?: string; method?: string; free?: boolean; network?: string; price?: { atomicUnits?: string }; contentType?: string; requestExample?: Record<string, unknown>; responseExample?: Record<string, unknown> }>;
      limitations?: string[];
    };
    assert.equal(metadata.service, "x402-reality-inspector");
    assert.equal(metadata.endpoints?.inspect?.path, "/api/inspect");
    assert.equal(metadata.endpoints?.inspect?.method, "POST");
    assert.equal(metadata.endpoints?.inspect?.free, true);
    assert.equal(metadata.endpoints?.inspect?.contentType, "application/json");
    assert.deepEqual(metadata.endpoints?.inspect?.requestExample, {
      type: "evidence",
      data: {
        status: 402,
        paymentRequirements: {
          scheme: "exact",
          network: "eip155:5042002",
          asset: "0x3600000000000000000000000000000000000000",
          amount: "1000",
          payTo: "0x295b633fce060736e6edc5b2bab697e953cdc30d",
        },
        httpFinal: 200,
        transfer: { status: "received", txHash: null },
      },
    });
    assert.equal(metadata.endpoints?.inspect?.responseExample?.OVERALL_STATUS, "UNKNOWN");
    assert.equal(metadata.endpoints?.paidTestnet?.path, "/api/paid-testnet");
    assert.equal(metadata.endpoints?.paidTestnet?.network, "eip155:5042002");
    assert.equal(metadata.endpoints?.paidTestnet?.price?.atomicUnits, "1000");
    assert.ok(metadata.limitations?.some((item) => item.toLowerCase().includes("settlement") && item.includes("UNKNOWN")));
    assert.ok(metadata.limitations?.some((item) => item.includes("automatically retry")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves a valid OpenAPI document for both public API routes", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/openapi.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const document = await response.json() as {
      openapi?: string;
      servers?: Array<{ url?: string }>;
      paths?: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: unknown; example?: unknown }> }; responses?: Record<string, unknown> } }>;
    };
    assert.match(document.openapi ?? "", /^3\./);
    assert.equal(document.servers?.[0]?.url, "https://x402-reality-inspector.onrender.com");
    assert.ok(document.paths?.["/api/inspect"]?.post);
    assert.ok(document.paths?.["/api/paid-testnet"]?.post);
    assert.ok(document.paths?.["/api/inspect"]?.post?.requestBody?.content?.["application/json"]?.example);
    assert.ok(document.paths?.["/api/inspect"]?.post?.responses?.["200"]);
    assert.ok(document.paths?.["/api/paid-testnet"]?.post?.responses?.["402"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("OpenAPI inspection example is executable against the inspection API", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const document = await (await fetch(`http://127.0.0.1:${address.port}/openapi.json`)).json() as {
      paths: { "/api/inspect": { post: { requestBody: { content: { "application/json": { example: Record<string, unknown> } } } } } };
    };
    const request = document.paths["/api/inspect"].post.requestBody.content["application/json"].example;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as Record<string, unknown>;
    assert.equal((result.PAYMENT_ATTEMPTED as { status: string }).status, "PASS");
    assert.equal((result.PAYMENT_SETTLED as { status: string }).status, "UNKNOWN");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("discovery request example is executable against the inspection API", async () => {
  const server = createInspectorServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const metadata = await (await fetch(`http://127.0.0.1:${address.port}/.well-known/x402-reality-inspector.json`)).json() as {
      endpoints: { inspect: { requestExample: Record<string, unknown> } };
    };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metadata.endpoints.inspect.requestExample),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).PAYMENT_ATTEMPTED.status, "PASS");
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
