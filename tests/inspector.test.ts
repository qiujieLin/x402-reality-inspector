import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectEvidence } from "../src/inspector.js";

const seller = "0x295b633fce060736e6edc5b2bab697e953cdc30d";
const challenge = {
  scheme: "exact",
  network: "eip155:5042002",
  asset: "0x3600000000000000000000000000000000000000",
  amount: "1000",
  payTo: seller,
};

test("valid HTTP 402 without payment is valid but incomplete", () => {
  const result = inspectEvidence({ type: "http402", data: { status: 402, paymentRequirements: challenge } });
  assert.equal(result.HTTP_402_VALID.status, "PASS");
  assert.equal(result.PAYMENT_REQUEST_VALID.status, "PASS");
  assert.equal(result.PAYMENT_ATTEMPTED.status, "NOT_APPLICABLE");
  assert.equal(result.PAYMENT_SETTLED.status, "NOT_APPLICABLE");
  assert.equal(result.OVERALL_STATUS, "UNKNOWN");
});

test("received transfer is not settled", () => {
  const result = inspectEvidence({ type: "evidence", data: { status: 402, paymentRequirements: challenge, transfer: { status: "received", txHash: null } } });
  assert.equal(result.PAYMENT_ATTEMPTED.status, "PASS");
  assert.equal(result.PAYMENT_SETTLED.status, "UNKNOWN");
  assert.equal(result.TRANSFER_STATUS.value, "received");
  assert.equal(result.OVERALL_STATUS, "UNKNOWN");
});

test("completed transfer with hash and seller receipt passes", () => {
  const result = inspectEvidence({ type: "evidence", data: {
    status: 402, paymentRequirements: challenge, httpFinal: 200,
    transfer: { status: "completed", txHash: "0x3196de49a3d8a23fc12ad1c04bca122b18f5f25be089e6835b5159af2b65e6f1", amount: "1000", recipientNetwork: challenge.network, toAddress: seller },
    sellerReceiptConfirmed: true,
    serviceResult: { ok: true, message: "Arc x402 seller test" },
  } });
  assert.equal(result.PAYMENT_SETTLED.status, "PASS");
  assert.equal(result.SELLER_RECEIPT_CONFIRMED.status, "PASS");
  assert.equal(result.SERVICE_RESULT_RECEIVED.status, "PASS");
  assert.equal(result.OVERALL_STATUS, "PASS");
});

test("HTTP 200 without settlement remains unknown", () => {
  const result = inspectEvidence({ type: "evidence", data: { status: 402, paymentRequirements: challenge, httpFinal: 200, serviceResult: { ok: true } } });
  assert.equal(result.SERVICE_RESULT_RECEIVED.status, "PASS");
  assert.equal(result.PAYMENT_SETTLED.status, "NOT_APPLICABLE");
  assert.equal(result.OVERALL_STATUS, "UNKNOWN");
});

test("CLI zero conflicts with authoritative positive balance", () => {
  const result = inspectEvidence({ type: "evidence", data: { status: 402, paymentRequirements: challenge, balances: { cli: { seller: "0" }, api: { seller: "0.001000" }, onchain: { seller: "1000" } } } });
  assert.equal(result.CONTRADICTIONS.length, 1);
  assert.equal(result.CONTRADICTIONS[0].field, "SELLER_BALANCE");
  assert.equal(result.OVERALL_STATUS, "UNKNOWN");
});

test("malformed payment requirements fail validation", () => {
  const result = inspectEvidence({ type: "http402", data: { status: 402, paymentRequirements: { network: "eip155:5042002" } } });
  assert.equal(result.PAYMENT_REQUEST_VALID.status, "FAIL");
  assert.equal(result.OVERALL_STATUS, "FAIL");
});

test("unsupported network fails validation without payment", () => {
  const result = inspectEvidence({ type: "http402", data: { status: 402, paymentRequirements: { ...challenge, network: "eip155:8453" } } });
  assert.equal(result.NETWORK.status, "FAIL");
  assert.equal(result.PAYMENT_ATTEMPTED.status, "NOT_APPLICABLE");
  assert.equal(result.OVERALL_STATUS, "FAIL");
});

test("URL, transfer ID, and transaction hash without evidence stay unknown", () => {
  for (const data of [
    { type: "endpoint", data: "https://example.com/paid" },
    { type: "transferId", data: "dca4345b-2409-4537-bad7-5abcc13cc430" },
    { type: "txHash", data: "0x3196de49a3d8a23fc12ad1c04bca122b18f5f25be089e6835b5159af2b65e6f1" },
  ]) {
    const result = inspectEvidence(data);
    assert.equal(result.OVERALL_STATUS, "UNKNOWN");
    assert.equal(result.HTTP_402_VALID.status, "UNKNOWN");
  }
});

test("pasted key-value evidence is parsed without network access", () => {
  const result = inspectEvidence({ type: "text", data: "HTTP_INITIAL = 402\nNETWORK = eip155:5042002\nSCHEME = exact\nASSET = 0x3600000000000000000000000000000000000000\nAMOUNT = 1000\nPAY_TO = " + seller });
  assert.equal(result.HTTP_402_VALID.status, "PASS");
  assert.equal(result.NETWORK.value, challenge.network);
  assert.equal(result.PAYMENT_REQUEST_VALID.status, "PASS");
});

test("pasted completed settlement fields are mapped from underscore keys", () => {
  const result = inspectEvidence({ type: "text", data: "HTTP_INITIAL = 402\nHTTP_FINAL = 200\nNETWORK = eip155:5042002\nSCHEME = exact\nASSET = 0x3600000000000000000000000000000000000000\nAMOUNT = 1000\nPAY_TO = " + seller + "\nPAYMENT_ATTEMPTED = true\nTRANSFER_STATUS = completed\nTX_HASH = 0x3196de49a3d8a23fc12ad1c04bca122b18f5f25be089e6835b5159af2b65e6f1\nSELLER_RECEIPT_CONFIRMED = true" });
  assert.equal(result.TRANSFER_STATUS.value, "completed");
  assert.equal(result.PAYMENT_SETTLED.status, "PASS");
  assert.equal(result.SERVICE_RESULT_RECEIVED.status, "PASS");
});

test("external issue with attempted payment but no live settlement evidence stays ambiguous", () => {
  const fixture = JSON.parse(readFileSync("fixtures/external-qntx-facilitator-73-ambiguous.json", "utf8"));
  const result = inspectEvidence(fixture.supportedInspectorInput);
  assert.equal(fixture.sourceType, "public_issue_static_analysis_not_live_reproduction");
  assert.equal(result.PAYMENT_ATTEMPTED.status, "PASS");
  assert.equal(result.PAYMENT_SETTLED.status, "UNKNOWN");
  assert.equal(result.TX_HASH.status, "UNKNOWN");
  assert.equal(result.SERVICE_RESULT_RECEIVED.status, "UNKNOWN");
  assert.equal(result.OVERALL_STATUS, "UNKNOWN");
  assert.ok(result.EVIDENCE_GAPS.includes("completed settlement and tx hash"));
});
