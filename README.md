# x402 Reality Inspector

Evidence-only diagnostics for HTTP 402 and x402 payment flows. V0.1 is deterministic and local: `inspectEvidence()` performs no network requests, and the server never contacts an endpoint, Circle, a Gateway, or a blockchain.

## Run locally

```powershell
npm install
npm test
npm run build
npm start
```

`npm run build` emits `dist/src/server.js` and copies the UI to `dist/public`. `npm start` runs the compiled production server. The server honors `PORT` and `HOST`; hosted deployments should provide `PORT` and use `HOST=0.0.0.0`. Locally, open `http://127.0.0.1:4173` and paste JSON, key-value output, or an identifier. `GET /health` returns the service/version contract. The API is:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4173/api/inspect `
  -ContentType 'application/json' `
  -Body '{"type":"http402","data":{"status":402,"paymentRequirements":{"scheme":"exact","network":"eip155:5042002","asset":"0x3600000000000000000000000000000000000000","amount":"1000","payTo":"0x295b633fce060736e6edc5b2bab697e953cdc30d"}}}'
```

## Arc Testnet paid endpoint

`POST /api/paid-testnet` is a real Circle x402 seller route protected by `@circle-fin/x402-batching`. It is fixed to Arc Testnet (`eip155:5042002`), the Arc Testnet USDC asset, a price of `0.001` USDC (`1000` atomic units), and the published test seller address in `src/server.ts`. An unpaid request returns the x402 v2 `PAYMENT-REQUIRED` challenge. This service never signs or submits a buyer payment; any buyer-side test must be a separately authorized, single Testnet-only action.

Supported input types are `http402`, `evidence`, `text`, `endpoint`, `transferId`, and `txHash`. An URL, transfer ID, or transaction hash is format-checked only; without user-supplied response evidence the result remains `UNKNOWN`.

## Status semantics

`PASS`, `FAIL`, `UNKNOWN`, and `NOT_APPLICABLE` are kept distinct. A 402 challenge can be valid while the overall reality is still `UNKNOWN` because no payment or settlement evidence exists. HTTP 200 does not prove settlement. A seller receipt requires explicit authoritative Gateway/API or onchain evidence.

Evidence priority is used only to explain contradictions: onchain/authoritative settlement, Gateway/API, SDK, CLI, then human assertion. Missing high-priority evidence never becomes an automatic failure.

Seller Gateway balance is not treated as proof that a particular transfer settled. A receipt must explicitly bind the seller confirmation to the payment evidence.

After a buyer flow obtains transfer metadata, callers may use `persistPaymentReceipt()` to save a non-sensitive JSON receipt under `artifacts/payment-receipts/`. The writer uses an allowlist, never stores signing material or credentials, and fails open if the filesystem write is unavailable.

## Report a real x402 case

Submit a sanitized public case through [GitHub Issues](https://github.com/qiujieLin/x402-reality-inspector/issues/new?template=x402-case.yml&title=Report%20an%20x402%20payment%20%2F%20settlement%20case). Remove API keys, private keys, Entity Secrets, Recovery Files, auth tokens, and personal sensitive information first. Missing evidence remains `UNKNOWN`; do not treat `UNKNOWN` as `FAIL`.

## For AI agents

Machine-readable service metadata is available at `/.well-known/x402-reality-inspector.json`. The free endpoint is `POST /api/inspect` and accepts `{ "type": "http402", "data": { ... } }` or the other documented evidence input types. A minimal agent flow is:

The `data` value for `evidence` and `http402` is a JSON object, not a JSON-encoded string. Copyable request shape:

```json
{
  "type": "evidence",
  "data": {
    "status": 402,
    "paymentRequirements": {
      "scheme": "exact",
      "network": "eip155:5042002",
      "asset": "0x3600000000000000000000000000000000000000",
      "amount": "1000",
      "payTo": "0x295b633fce060736e6edc5b2bab697e953cdc30d"
    },
    "httpFinal": 200,
    "transfer": { "status": "received", "txHash": null }
  }
}
```

Send that object as the JSON body to `/api/inspect`; do not put the complete envelope inside a string.

```text
1. POST /api/paid-testnet with no payment.
2. Confirm HTTP 402 and read the PAYMENT-REQUIRED challenge.
3. Submit the challenge and any settlement evidence to POST /api/inspect.
4. Treat UNKNOWN as unknown: HTTP 200, a positive seller balance, or a received transfer alone does not prove final settlement.
```

The testnet paid route is fixed to Arc Testnet (`eip155:5042002`) at 0.001 Test USDC. This Inspector does not create transactions or automatically retry payments.

## Publication

The shortest public deployment path is to push this standalone directory to a new repository, connect it to a free Node-compatible HTTPS web-service host, set the build command to `npm run build`, the start command to `npm start`, and bind the host-provided `PORT`. Keep the app behind HTTPS and rate-limit `/api/inspect` before exposing it publicly. No secrets or Circle credentials are needed. Render's free web-service flow is compatible with this start/build model but requires the owner to log in and authorize the deployment.

## Scope

This tool does not pay, sign, create wallets, call Circle Mainnet, call CCTP, use Gas Station, or automatically verify remote identifiers. `REAL_FUNDS_MOVED` is always `FALSE` for this MVP.
