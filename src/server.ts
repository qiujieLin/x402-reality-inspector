import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inspectEvidence } from "./inspector.js";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function send(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createInspectorServer(): Server {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") {
      send(response, 200, JSON.stringify({
        ok: true,
        service: "x402-reality-inspector",
        version: "0.1",
        networkAccess: false,
      }), "application/json; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/") {
      send(response, 200, indexHtml, "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/inspect") {
      if (request.method !== "POST") {
        send(response, 405, JSON.stringify({ error: "method_not_allowed" }), "application/json; charset=utf-8");
        return;
      }
      try {
        const body = JSON.parse(await readBody(request));
        const result = inspectEvidence(body);
        send(response, 200, JSON.stringify(result), "application/json; charset=utf-8");
      } catch (error) {
        const errorType = error instanceof SyntaxError ? "invalid_json" : error instanceof Error ? error.message : "invalid_request";
        send(response, 400, JSON.stringify({ error: errorType }), "application/json; charset=utf-8");
      }
      return;
    }
    send(response, 404, JSON.stringify({ error: "not_found" }), "application/json; charset=utf-8");
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? "127.0.0.1";
  createInspectorServer().listen(port, host, () => {
    console.log(`x402 Reality Inspector listening at http://${host}:${port}`);
  });
}
