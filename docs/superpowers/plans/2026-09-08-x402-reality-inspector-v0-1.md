# x402 Reality Inspector V0.1 Implementation Plan

**Goal:** Build a dependency-light local TypeScript tool that explains x402 reality evidence without automatically contacting endpoints or moving funds.

**Architecture:** A pure `inspectEvidence()` function normalizes JSON/text evidence, computes field conclusions, and detects contradictions. A Node HTTP server exposes `/api/inspect` and serves a small static page; neither route contains business rules.

**Tech Stack:** TypeScript, Node built-in `http`, `tsx`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-x402-reality-inspector-v0-1.md`

## Global Constraints

- No Circle project or secret access.
- No network verification for endpoint URLs, transfer IDs, or transaction hashes.
- Missing evidence is `UNKNOWN`, never guessed as `PASS` or `FAIL`.
- No wallet, signing, transfer, gas, CCTP, or Mainnet operations.

### Task 1: Pure inspector

**Files:** `src/inspector.ts`, `tests/inspector.test.ts`

- [ ] Write fixtures-driven tests for eight required cases.
- [ ] Run tests and confirm the missing inspector fails.
- [ ] Implement normalization, conclusions, priority-aware contradictions, and deterministic next action.
- [ ] Run the complete test suite.

### Task 2: API and UI

**Files:** `src/server.ts`, `public/index.html`, `tests/server.test.ts`

- [ ] Write route tests for health, API inspection, and UI serving.
- [ ] Implement thin HTTP adapters around `inspectEvidence()`.
- [ ] Run tests and build.

### Task 3: Fixtures and documentation

**Files:** `fixtures/*.json`, `README.md`

- [ ] Add the eight evidence fixtures and historical non-sensitive case.
- [ ] Document local startup, API input, output semantics, and shortest publication path.

### Task 4: Local verification

- [ ] Start the server on loopback.
- [ ] Verify `/health`, `/api/inspect`, and `/` with local requests only.
- [ ] Record build and test results.
