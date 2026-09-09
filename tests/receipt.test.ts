import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistPaymentReceipt } from "../src/payment-receipts.js";

test("persists only non-sensitive payment receipt fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "x402-receipt-"));
  const result = await persistPaymentReceipt({
    transferId: "043a1c0f-762f-45af-9cb0-e59e96f15e1e",
    network: "eip155:5042002",
    amount: "1000",
    token: "USDC",
    fromAddress: "0x0273db8dcfe2e33aa0d524037b711358d5eebb42",
    toAddress: "0x295b633fce060736e6edc5b2bab697e953cdc30d",
    createdAt: "2026-09-09T05:44:44.906Z",
    paymentEndpoint: "https://example.test/api/paid",
    httpResult: { status: 200, body: { ok: true } },
    status: "received",
    authorizationSignature: "must-not-be-written",
    apiKey: "must-not-be-written",
  }, directory);

  assert.equal(result.saved, true);
  const saved = JSON.parse(await readFile(result.path!, "utf8")) as Record<string, unknown>;
  assert.deepEqual(saved, {
    transferId: "043a1c0f-762f-45af-9cb0-e59e96f15e1e",
    network: "eip155:5042002",
    amount: "1000",
    token: "USDC",
    fromAddress: "0x0273db8dcfe2e33aa0d524037b711358d5eebb42",
    toAddress: "0x295b633fce060736e6edc5b2bab697e953cdc30d",
    createdAt: "2026-09-09T05:44:44.906Z",
    paymentEndpoint: "https://example.test/api/paid",
    httpResult: { status: 200, body: { ok: true } },
    status: "received",
  });
  assert.equal(JSON.stringify(saved).includes("must-not-be-written"), false);
});

test("receipt persistence failure is non-fatal", async () => {
  const blocker = join(tmpdir(), `x402-receipt-blocker-${Date.now()}`);
  await writeFile(blocker, "not a directory", "utf8");
  const result = await persistPaymentReceipt({
    transferId: "043a1c0f-762f-45af-9cb0-e59e96f15e1e",
    network: "eip155:5042002",
    amount: "1000",
    token: "USDC",
    fromAddress: "0x0273db8dcfe2e33aa0d524037b711358d5eebb42",
    toAddress: "0x295b633fce060736e6edc5b2bab697e953cdc30d",
    createdAt: "2026-09-09T05:44:44.906Z",
    paymentEndpoint: "https://example.test/api/paid",
    httpResult: { status: 200 },
  }, blocker);
  assert.equal(result.saved, false);
  assert.equal(result.path, undefined);
});
