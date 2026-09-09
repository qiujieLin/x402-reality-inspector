import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler } from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { inspectEvidence } from "./inspector.js";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const sellerAddress = process.env.SELLER_ADDRESS ?? "0x295b633fce060736e6edc5b2bab697e953cdc30d";
const discoveryMetadata = {
  schemaVersion: "0.1",
  service: "x402-reality-inspector",
  description: "Evidence-only diagnostics for HTTP 402 and x402 payment flows.",
  capabilities: ["parse_http_402", "inspect_payment_requirements", "trace_user_supplied_transfer_evidence", "detect_evidence_contradictions"],
  endpoints: {
    inspect: {
      path: "/api/inspect",
      method: "POST",
      free: true,
      inputSchema: { type: "object", required: ["type", "data"] },
      outputSchema: { type: "object", fieldStatuses: ["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"] },
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
