# x402 Reality Inspector V0.1

The MVP is a local, deterministic evidence analyzer. `inspectEvidence()` is a pure function with no network access. The HTTP server and browser UI only adapt user input to that function and render its result.

Inputs may be an HTTP 402/evidence object, an endpoint URL, a transfer ID, a transaction hash, or pasted text/JSON. Identifiers without corroborating evidence remain `UNKNOWN`.

Conclusions use `PASS`, `FAIL`, `UNKNOWN`, and `NOT_APPLICABLE`. Evidence priority only ranks conflicting claims; missing higher-priority evidence never causes an automatic failure. Onchain/authoritative settlement evidence outranks Gateway/API, SDK, CLI, and human assertions.
