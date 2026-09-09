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

Supported input types are `http402`, `evidence`, `text`, `endpoint`, `transferId`, and `txHash`. An URL, transfer ID, or transaction hash is format-checked only; without user-supplied response evidence the result remains `UNKNOWN`.

## Status semantics

`PASS`, `FAIL`, `UNKNOWN`, and `NOT_APPLICABLE` are kept distinct. A 402 challenge can be valid while the overall reality is still `UNKNOWN` because no payment or settlement evidence exists. HTTP 200 does not prove settlement. A seller receipt requires explicit authoritative Gateway/API or onchain evidence.

Evidence priority is used only to explain contradictions: onchain/authoritative settlement, Gateway/API, SDK, CLI, then human assertion. Missing high-priority evidence never becomes an automatic failure.

## Report a real x402 case

Submit a sanitized public case through [GitHub Issues](https://github.com/qiujieLin/x402-reality-inspector/issues/new?template=x402-case.yml&title=Report%20an%20x402%20payment%20%2F%20settlement%20case). Remove API keys, private keys, Entity Secrets, Recovery Files, auth tokens, and personal sensitive information first. Missing evidence remains `UNKNOWN`; do not treat `UNKNOWN` as `FAIL`.

## Publication

The shortest public deployment path is to push this standalone directory to a new repository, connect it to a free Node-compatible HTTPS web-service host, set the build command to `npm run build`, the start command to `npm start`, and bind the host-provided `PORT`. Keep the app behind HTTPS and rate-limit `/api/inspect` before exposing it publicly. No secrets or Circle credentials are needed. Render's free web-service flow is compatible with this start/build model but requires the owner to log in and authorize the deployment.

## Scope

This tool does not pay, sign, create wallets, call Circle Mainnet, call CCTP, use Gas Station, or automatically verify remote identifiers. `REAL_FUNDS_MOVED` is always `FALSE` for this MVP.
