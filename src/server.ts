import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler } from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { inspectEvidence } from "./inspector.js";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const sellerAddress = process.env.SELLER_ADDRESS ?? "0x295b633fce060736e6edc5b2bab697e953cdc30d";
const inspectRequestExample = {
  type: "evidence",
  data: {
    status: 402,
    paymentRequirements: {
      scheme: "exact",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000",
      amount: "1000",
      payTo: sellerAddress,
    },
    httpFinal: 200,
    transfer: { status: "received", txHash: null },
  },
};
const inspectResponseExample = {
  OVERALL_STATUS: "UNKNOWN",
  PAYMENT_ATTEMPTED: { status: "PASS", value: true },
  PAYMENT_SETTLED: { status: "UNKNOWN", value: null },
  TX_HASH: { status: "UNKNOWN", value: null },
  SERVICE_RESULT_RECEIVED: { status: "PASS", value: true },
};
const discoveryMetadata = {
  schemaVersion: "0.1",
  service: "x402-reality-inspector",
  description: "Evidence-only diagnostics for HTTP 402 and x402 payment flows.",
  openapi: "https://x402-reality-inspector.onrender.com/openapi.json",
  capabilities: ["parse_http_402", "inspect_payment_requirements", "trace_user_supplied_transfer_evidence", "detect_evidence_contradictions"],
  endpoints: {
    inspect: {
      path: "/api/inspect",
      method: "POST",
      free: true,
      contentType: "application/json",
      inputSchema: {
        type: "object",
        required: ["type", "data"],
        properties: {
          type: { type: "string", enum: ["http402", "evidence", "text", "endpoint", "transferId", "txHash"] },
          data: { type: "object", description: "For evidence/http402, pass the evidence object directly; do not JSON.stringify it into a string." },
        },
      },
      outputSchema: { type: "object", fieldStatuses: ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"] },
      requestExample: inspectRequestExample,
      responseExample: inspectResponseExample,
    },
    paidTestnet: {
      path: "/api/paid-testnet",
      method: "POST",
      free: false,
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000",
      payTo: sellerAddress,
      price: { display: "0.001 Test USDC", atomicUnits: "1000" },
      payment: "x402 GatewayWalletBatched",
    },
  },
  limitations: [
    "Settlement UNKNOWN is not FAIL.",
    "Seller balance alone does not prove settlement of a specific transfer.",
    "The Inspector does not automatically create on-chain transactions.",
    "The Inspector does not automatically retry payments.",
    "Endpoint URLs, transfer IDs, and transaction hashes are not fetched automatically; user-supplied evidence is required.",
  ],
};

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "x402 Reality Inspector",
    version: "0.1.0",
    description: "Evidence-only diagnostics for HTTP 402 and x402 payment flows. The Inspector never performs network verification, creates transactions, retries payments, or treats HTTP 200 as settlement proof.",
    "x-guidance": "Submit user-provided x402 evidence to POST /api/inspect. UNKNOWN means the supplied evidence is insufficient; it is not FAIL.",
  },
  servers: [{ url: "https://x402-reality-inspector.onrender.com" }],
  paths: {
    "/api/inspect": {
      post: {
        operationId: "inspectEvidence",
        summary: "Inspect supplied x402 evidence",
        description: "Pure, deterministic analysis of a user-supplied evidence envelope. The data field must be a JSON object for evidence/http402 input, not a JSON-encoded string.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { "$ref": "#/components/schemas/InspectRequest" },
              example: inspectRequestExample,
            },
          },
        },
        responses: {
          "200": { description: "Structured evidence diagnosis", content: { "application/json": { schema: { "$ref": "#/components/schemas/InspectionResult" } } } },
          "400": { description: "Invalid JSON or request processing error", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } },
          "405": { description: "Only POST is supported", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } },
          "413": { description: "Request body exceeds the 1 MiB limit", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/paid-testnet": {
      post: {
        operationId: "paidTestnetRealityEndpoint",
        summary: "Arc Testnet x402 validation endpoint",
        description: "Testnet-only paid endpoint. An unpaid request returns HTTP 402 with x402 payment requirements. A valid paid flow may return HTTP 200. This does not claim final settlement, seller receipt finality, Mainnet support, or production payment reliability.",
        "x-payment-info": {
          protocol: "x402",
          network: "eip155:5042002",
          asset: "0x3600000000000000000000000000000000000000",
          amount: "1000",
          currency: "Test USDC",
          environment: "Arc Testnet only",
        },
        responses: {
          "200": { description: "Service result after a valid payment flow", content: { "application/json": { schema: { "$ref": "#/components/schemas/PaidTestnetResult" } } } },
          "402": {
            description: "Payment Required; unpaid requests receive x402 requirements",
            headers: { "PAYMENT-REQUIRED": { description: "Base64-encoded x402 v2 payment requirements", schema: { type: "string" } } },
            content: { "application/json": { schema: { type: "object", additionalProperties: true, example: {} } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Status: { type: "string", enum: ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"] },
      Conclusion: {
        type: "object",
        required: ["status", "value", "evidence"],
        properties: {
          status: { "$ref": "#/components/schemas/Status" },
          value: { oneOf: [{ type: "string" }, { type: "boolean" }, { type: "null" }] },
          evidence: { type: "array", items: { type: "string" } },
        },
      },
      InspectRequest: {
        type: "object",
        required: ["type", "data"],
        properties: {
          type: { type: "string", enum: ["http402", "evidence", "text", "endpoint", "transferId", "txHash"] },
          data: {
            description: "For evidence/http402 use the evidence object directly. For text/endpoint/transferId/txHash a string is accepted. Do not stringify the complete envelope into this field.",
            oneOf: [
              { "$ref": "#/components/schemas/EvidenceObject" },
              { type: "string" },
            ],
          },
        },
        example: inspectRequestExample,
      },
      EvidenceObject: {
        type: "object",
        description: "User-supplied evidence. The runtime accepts the evidence fields shown in the example and preserves unknown fields for deterministic inspection.",
        properties: {
          status: { type: "integer", example: 402 },
          paymentRequirements: { "$ref": "#/components/schemas/PaymentRequirements" },
          httpFinal: { type: "integer", example: 200 },
          transfer: { "$ref": "#/components/schemas/TransferEvidence" },
        },
        additionalProperties: true,
      },
      PaymentRequirements: {
        type: "object",
        required: ["scheme", "network", "asset", "amount", "payTo"],
        properties: {
          scheme: { type: "string", example: "exact" },
          network: { type: "string", example: "eip155:5042002" },
          asset: { type: "string", example: "0x3600000000000000000000000000000000000000" },
          amount: { type: "string", pattern: "^[0-9]+$", example: "1000" },
          payTo: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$", example: sellerAddress },
        },
      },
      TransferEvidence: {
        type: "object",
        properties: {
          status: { type: "string", example: "received" },
          txHash: { oneOf: [{ type: "string" }, { type: "null" }], example: null },
        },
        additionalProperties: true,
      },
      InspectionResult: {
        type: "object",
        required: ["OVERALL_STATUS", "HTTP_402_VALID", "NETWORK", "SCHEME", "ASSET", "AMOUNT", "PAY_TO", "PAYMENT_REQUEST_VALID", "PAYMENT_ATTEMPTED", "PAYMENT_SETTLED", "SERVICE_RESULT_RECEIVED", "TRANSFER_STATUS", "TX_HASH", "SELLER_RECEIPT_CONFIRMED", "EVIDENCE_GAPS", "CONTRADICTIONS", "LIKELY_FAILURE_LAYER", "NEXT_ACTION"],
        properties: {
          OVERALL_STATUS: { "$ref": "#/components/schemas/Status" },
          HTTP_402_VALID: { "$ref": "#/components/schemas/Conclusion" },
          NETWORK: { "$ref": "#/components/schemas/Conclusion" },
          SCHEME: { "$ref": "#/components/schemas/Conclusion" },
          ASSET: { "$ref": "#/components/schemas/Conclusion" },
          AMOUNT: { "$ref": "#/components/schemas/Conclusion" },
          PAY_TO: { "$ref": "#/components/schemas/Conclusion" },
          PAYMENT_REQUEST_VALID: { "$ref": "#/components/schemas/Conclusion" },
          PAYMENT_ATTEMPTED: { "$ref": "#/components/schemas/Conclusion" },
          PAYMENT_SETTLED: { "$ref": "#/components/schemas/Conclusion" },
          SERVICE_RESULT_RECEIVED: { "$ref": "#/components/schemas/Conclusion" },
          TRANSFER_STATUS: { "$ref": "#/components/schemas/Conclusion" },
          TX_HASH: { "$ref": "#/components/schemas/Conclusion" },
          SELLER_RECEIPT_CONFIRMED: { "$ref": "#/components/schemas/Conclusion" },
          EVIDENCE_GAPS: { type: "array", items: { type: "string" } },
          CONTRADICTIONS: { type: "array", items: { "$ref": "#/components/schemas/Contradiction" } },
          LIKELY_FAILURE_LAYER: { type: "string" },
          NEXT_ACTION: { type: "string" },
        },
      },
      Contradiction: {
        type: "object",
        required: ["field", "severity", "higherPriorityEvidence", "lowerPriorityEvidence", "resolution"],
        properties: {
          field: { type: "string" }, severity: { type: "string", enum: ["warning"] },
          higherPriorityEvidence: { type: "array", items: { type: "string" } },
          lowerPriorityEvidence: { type: "array", items: { type: "string" } },
          resolution: { type: "string" },
        },
      },
      PaidTestnetResult: {
        type: "object",
        required: ["ok", "message"],
        properties: { ok: { type: "boolean", example: true }, message: { type: "string", example: "Arc x402 seller test" } },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
    },
  },
};

// 该 middleware 只负责在 Arc Testnet 上生成/校验 x402 付款要求；不包含买方签名或付款逻辑。
const gateway = createGatewayMiddleware({
  sellerAddress,
  networks: ["eip155:5042002"],
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
  description: "Arc Testnet x402 Reality Inspector test endpoint",
});

export function createInspectorServer(): Server {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({
        ok: true,
        service: "x402-reality-inspector",
        version: "0.1",
        networkAccess: false,
      });
  });

  app.get("/", (_request, response) => {
    response.type("html").send(indexHtml);
  });

  app.get("/openapi.json", (_request, response) => {
    response.json(openApiDocument);
  });

  app.get("/.well-known/x402-reality-inspector.json", (_request, response) => {
    response.json(discoveryMetadata);
  });

  app.all("/api/inspect", (request, response, next) => {
    if (request.method !== "POST") {
      response.status(405).json({ error: "method_not_allowed" });
      return;
    }
    next();
  });

  app.post("/api/inspect", (request, response) => {
    response.json(inspectEvidence(request.body));
  });

  // 测试端点固定为 0.001 USDC，收款地址只允许通过非敏感环境变量覆盖。
  app.post(
    "/api/paid-testnet",
    gateway.require("$0.001"),
    (_request, response) => response.json({ ok: true, message: "Arc x402 seller test" }),
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "not_found" });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const typedError = error as Error & { type?: string };
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: "invalid_json" });
      return;
    }
    if (error instanceof Error && typedError.type === "entity.too.large") {
      response.status(413).json({ error: "body_too_large" });
      return;
    }
    response.status(400).json({ error: error instanceof Error ? error.message : "invalid_request" });
  };
  app.use(errorHandler);

  return createServer(app);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? "127.0.0.1";
  createInspectorServer().listen(port, host, () => {
    console.log(`x402 Reality Inspector listening at http://${host}:${port}`);
  });
}
