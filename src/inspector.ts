export type Status = "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";

export interface Conclusion<T = unknown> {
  status: Status;
  value: T;
  evidence: string[];
}

export interface Contradiction {
  field: string;
  severity: "warning";
  higherPriorityEvidence: string[];
  lowerPriorityEvidence: string[];
  resolution: string;
}

export interface InspectInput {
  type?: string;
  data?: unknown;
}

export interface InspectionResult {
  OVERALL_STATUS: Status;
  HTTP_402_VALID: Conclusion<boolean | null>;
  NETWORK: Conclusion<string | null>;
  SCHEME: Conclusion<string | null>;
  ASSET: Conclusion<string | null>;
  AMOUNT: Conclusion<string | null>;
  PAY_TO: Conclusion<string | null>;
  PAYMENT_REQUEST_VALID: Conclusion<boolean | null>;
  PAYMENT_ATTEMPTED: Conclusion<boolean | null>;
  PAYMENT_SETTLED: Conclusion<boolean | null>;
  SERVICE_RESULT_RECEIVED: Conclusion<boolean | null>;
  TRANSFER_STATUS: Conclusion<string | null>;
  TX_HASH: Conclusion<string | null>;
  SELLER_RECEIPT_CONFIRMED: Conclusion<boolean | null>;
  EVIDENCE_GAPS: string[];
  CONTRADICTIONS: Contradiction[];
  LIKELY_FAILURE_LAYER: string;
  NEXT_ACTION: string;
}

const ARC_NETWORK = "eip155:5042002";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function valueAt(source: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const direct = source[name];
    if (direct !== undefined && direct !== null) return direct;
    const found = Object.keys(source).find((key) => key.toLowerCase() === name.toLowerCase());
    if (found) return source[found];
  }
  return undefined;
}

function numberValue(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && Number.isFinite(number) ? number : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePastedText(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z0-9_ -]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].trim().replace(/[ -]/g, "_").toLowerCase();
    let value: unknown = match[2];
    if (/^\d+$/.test(match[2])) value = Number(match[2]);
    else if (match[2].toLowerCase() === "true") value = true;
    else if (match[2].toLowerCase() === "false") value = false;
    else {
      try { value = JSON.parse(match[2]); } catch { /* retain text */ }
    }
    result[key] = value;
  }
  return result;
}

function normalizeData(input: InspectInput): { data: Record<string, unknown>; unsupportedInput: boolean } {
  if (["endpoint", "transferId", "txHash"].includes(input.type ?? "")) {
    return { data: {}, unsupportedInput: false };
  }
  if (typeof input.data === "string") {
    try {
      const parsed = JSON.parse(input.data);
      return { data: objectValue(parsed), unsupportedInput: false };
    } catch {
      return { data: parsePastedText(input.data), unsupportedInput: false };
    }
  }
  if (input.data && typeof input.data === "object") return { data: objectValue(input.data), unsupportedInput: false };
  if (input && typeof input === "object" && !input.type && !input.data) return { data: objectValue(input), unsupportedInput: false };
  return { data: {}, unsupportedInput: false };
}

function findChallenge(data: Record<string, unknown>): Record<string, unknown> {
  const candidate = valueAt(data, ["paymentRequirements", "payment_requirements", "challenge"]);
  const candidateObject = objectValue(candidate);
  const accepts = valueAt(candidateObject, ["accepts"]);
  if (Array.isArray(accepts) && accepts.length > 0) return objectValue(accepts[0]);
  if (Object.keys(candidateObject).length > 0) return candidateObject;
  const rootAccepts = valueAt(data, ["accepts"]);
  if (Array.isArray(rootAccepts) && rootAccepts.length > 0) return objectValue(rootAccepts[0]);
  return data;
}

function conclusion<T>(status: Status, value: T, evidence: string[]): Conclusion<T> {
  return { status, value, evidence };
}

function boolFlag(data: Record<string, unknown>, names: string[]): boolean | null {
  const value = valueAt(data, names);
  return typeof value === "boolean" ? value : null;
}

function positive(value: unknown): boolean {
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/,/g, ""));
    return Number.isFinite(numeric) && numeric > 0;
  }
  return false;
}

function balanceAt(balances: Record<string, unknown>, sourceNames: string[]): unknown {
  for (const sourceName of sourceNames) {
    const source = objectValue(valueAt(balances, [sourceName]));
    const seller = valueAt(source, ["seller", "total", "balance", "available"]);
    if (seller !== undefined) return seller;
  }
  return undefined;
}

function detectContradictions(data: Record<string, unknown>): Contradiction[] {
  const balances = objectValue(valueAt(data, ["balances", "balanceEvidence"]));
  const cli = balanceAt(balances, ["cli", "cliBalance"]) ?? valueAt(data, ["cliBalance"]);
  const api = balanceAt(balances, ["api", "gateway", "rawApi", "sdk"]) ?? valueAt(data, ["gatewayBalance"]);
  const onchain = balanceAt(balances, ["onchain", "onChain"]) ?? valueAt(data, ["onchainBalance"]);
  const authoritative = [api, onchain].filter((value) => positive(value));
  if (cli !== undefined && !positive(cli) && authoritative.length > 0) {
    return [{
      field: "SELLER_BALANCE",
      severity: "warning",
      higherPriorityEvidence: [
        api !== undefined && positive(api) ? `Gateway/API seller balance=${String(api)}` : "",
        onchain !== undefined && positive(onchain) ? `onchain seller balance=${String(onchain)}` : "",
      ].filter(Boolean),
      lowerPriorityEvidence: [`CLI seller balance=${String(cli)}`],
      resolution: "Authoritative Gateway/API or onchain evidence outranks CLI display; retain the contradiction as a warning.",
    }];
  }
  return [];
}

export function inspectEvidence(input: InspectInput): InspectionResult {
  const normalized = normalizeData(input);
  const data = normalized.data;
  const challenge = findChallenge(data);
  const network = textValue(valueAt(challenge, ["network", "recipientNetwork"]));
  const scheme = textValue(valueAt(challenge, ["scheme"]));
  const asset = textValue(valueAt(challenge, ["asset", "token"]));
  const amount = valueAt(challenge, ["amount"]);
  const amountText = amount === undefined || amount === null ? null : String(amount);
  const payTo = textValue(valueAt(challenge, ["payTo", "pay_to", "seller", "toAddress"]));
  const initialStatus = numberValue(valueAt(data, ["httpInitial", "HTTP_INITIAL", "initialStatus", "status", "httpStatus"]));
  const transfer = objectValue(valueAt(data, ["transfer", "settlement", "transferEvidence"]));
  const transferStatus = textValue(valueAt(transfer, ["status"])) ?? textValue(valueAt(data, ["transferStatus", "TRANSFER_STATUS", "transfer_status"]));
  const hash = textValue(valueAt(transfer, ["txHash", "transactionHash"])) ?? textValue(valueAt(data, ["txHash", "TX_HASH", "tx_hash", "transactionHash"]));
  const finalStatus = numberValue(valueAt(data, ["httpFinal", "HTTP_FINAL", "http_final", "finalStatusCode", "httpFinalStatus"]))
    ?? numberValue(valueAt(objectValue(valueAt(data, ["serviceResult", "response"])), ["status", "httpStatus"]));
  const service = valueAt(data, ["serviceResult", "service_result"]);
  const explicitAttempt = boolFlag(data, ["paymentAttempted", "payment_attempted"]);
  const explicitReceipt = boolFlag(data, ["sellerReceiptConfirmed", "seller_receipt_confirmed"]);
  const requirementsProvided = valueAt(data, ["paymentRequirements", "payment_requirements", "challenge", "accepts"]) !== undefined
    || ["network", "scheme", "asset", "amount", "payTo", "pay_to"].some((name) => valueAt(data, [name]) !== undefined);
  const attempted = explicitAttempt ?? (Object.keys(transfer).length > 0 || hash !== null || Object.keys(objectValue(valueAt(data, ["payment"]))).length > 0 ? true : null);
  const httpValid = initialStatus === null ? conclusion("UNKNOWN", null, ["HTTP initial status is missing"]) : initialStatus === 402
    ? conclusion("PASS", true, ["HTTP initial status=402"])
    : conclusion("FAIL", false, [`HTTP initial status=${initialStatus}, expected 402`]);
  const networkResult = network === null ? conclusion("UNKNOWN", null, ["network missing from payment requirements"]) : network === ARC_NETWORK
    ? conclusion("PASS", network, [`network=${network}`]) : conclusion("FAIL", network, [`unsupported network=${network}`]);
  const schemeResult = scheme === null ? conclusion("UNKNOWN", null, ["scheme missing"]) : scheme === "exact"
    ? conclusion("PASS", scheme, [`scheme=${scheme}`]) : conclusion("FAIL", scheme, [`unsupported scheme=${scheme}`]);
  const assetResult = asset === null ? conclusion("UNKNOWN", null, ["asset missing"]) : asset.toLowerCase() === ARC_USDC
    ? conclusion("PASS", asset, [`asset=${asset}`]) : conclusion("FAIL", asset, [`unsupported asset=${asset}`]);
  const amountResult = amountText === null ? conclusion("UNKNOWN", null, ["amount missing"]) : /^\d+$/.test(amountText)
    ? conclusion("PASS", amountText, [`amount=${amountText} atomic units`]) : conclusion("FAIL", amountText, ["amount must be integer atomic units"]);
  const payToResult = payTo === null ? conclusion("UNKNOWN", null, ["payTo missing"]) : ADDRESS.test(payTo)
    ? conclusion("PASS", payTo, [`payTo=${payTo}`]) : conclusion("FAIL", payTo, ["payTo is not a 0x address"]);
  const requestStatuses = [networkResult, schemeResult, assetResult, amountResult, payToResult];
  const requestStatus: Status = requestStatuses.some((item) => item.status === "FAIL") || (initialStatus === 402 && requirementsProvided && requestStatuses.some((item) => item.status === "UNKNOWN"))
    ? "FAIL" : requestStatuses.some((item) => item.status === "UNKNOWN") ? "UNKNOWN" : "PASS";
  const requestResult = conclusion(requestStatus, requestStatus === "PASS" ? true : requestStatus === "FAIL" ? false : null, requestStatuses.flatMap((item) => item.evidence));
  const attemptedResult = attempted === null ? conclusion(initialStatus === 402 ? "NOT_APPLICABLE" : "UNKNOWN", null, ["No payment or transfer evidence supplied"]) : attempted
    ? conclusion("PASS", true, ["payment/transfer evidence supplied"]) : conclusion("NOT_APPLICABLE", false, ["payment explicitly not attempted"]);
  const settledResult = attemptedResult.status === "NOT_APPLICABLE" ? conclusion("NOT_APPLICABLE", null, ["payment was not attempted"]) : transferStatus === "failed"
    ? conclusion("FAIL", false, ["transfer.status=failed"]) : transferStatus === "completed" && hash && TX_HASH.test(hash)
      ? conclusion("PASS", true, ["transfer.status=completed", "txHash present and well-formed"]) : conclusion("UNKNOWN", null, ["settlement is not completed with a transaction hash"]);
  const transferResult = transferStatus === null ? conclusion("UNKNOWN", null, ["transfer status missing"]) : ["received", "batched", "confirmed", "completed", "failed"].includes(transferStatus)
    ? conclusion("PASS", transferStatus, [`transfer.status=${transferStatus}`]) : conclusion("UNKNOWN", transferStatus, [`unrecognized transfer.status=${transferStatus}`]);
  const hashResult = hash === null ? conclusion("UNKNOWN", null, ["transaction hash missing"]) : TX_HASH.test(hash)
    ? conclusion("PASS", hash, ["transaction hash format valid"]) : conclusion("FAIL", hash, ["transaction hash format invalid"]);
  const serviceResult = finalStatus === null ? conclusion("UNKNOWN", null, ["final service HTTP status missing"]) : finalStatus === 200
    ? conclusion("PASS", true, ["final HTTP status=200", service === undefined ? "service body not supplied" : "service result supplied"]) : conclusion("FAIL", false, [`final HTTP status=${finalStatus}`]);
  const sellerReceipt = explicitReceipt === true ? conclusion("PASS", true, ["sellerReceiptConfirmed=true"]) : explicitReceipt === false ? conclusion("FAIL", false, ["sellerReceiptConfirmed=false"]) : attemptedResult.status === "NOT_APPLICABLE" ? conclusion("NOT_APPLICABLE", null, ["payment was not attempted"]) : conclusion("UNKNOWN", null, ["seller receipt confirmation missing; balance alone is not attributable to this transfer"]);
  const gaps = [...new Set([
    ...httpValid.status === "UNKNOWN" ? ["initial HTTP 402 response"] : [],
    ...requestResult.status === "UNKNOWN" ? ["complete payment requirements"] : [],
    ...attemptedResult.status === "NOT_APPLICABLE" ? ["payment attempt evidence"] : [],
    ...settledResult.status === "UNKNOWN" ? ["completed settlement and tx hash"] : [],
    ...serviceResult.status === "UNKNOWN" ? ["final service response"] : [],
    ...sellerReceipt.status === "UNKNOWN" ? ["seller receipt or authoritative seller balance"] : [],
  ])];
  const contradictions = detectContradictions(data);
  const hardFailure = [httpValid, requestResult, networkResult, schemeResult, assetResult, amountResult, payToResult, settledResult, serviceResult, sellerReceipt].some((item) => item.status === "FAIL");
  const allPass = httpValid.status === "PASS" && requestResult.status === "PASS" && attemptedResult.status === "PASS" && settledResult.status === "PASS" && serviceResult.status === "PASS" && sellerReceipt.status === "PASS";
  const overall: Status = allPass ? "PASS" : hardFailure ? "FAIL" : "UNKNOWN";
  let layer = "none";
  let action = "No automatic network action; inspect the supplied evidence only.";
  if (overall === "PASS") { layer = "none"; action = "Reality evidence is internally consistent and complete."; }
  else if (requestResult.status === "FAIL") { layer = "parser_or_policy"; action = "Correct the malformed or unsupported payment requirements."; }
  else if (settledResult.status === "UNKNOWN") { layer = "settlement"; action = "Provide the same transfer's completed status and transaction hash."; }
  else if (sellerReceipt.status === "UNKNOWN") { layer = "receipt_evidence"; action = "Provide authoritative Gateway/API or onchain seller receipt evidence."; }
  else if (attemptedResult.status === "NOT_APPLICABLE") { layer = "payment"; action = "No payment was attempted; do not infer settlement."; }
  return {
    OVERALL_STATUS: overall,
    HTTP_402_VALID: httpValid,
    NETWORK: networkResult,
    SCHEME: schemeResult,
    ASSET: assetResult,
    AMOUNT: amountResult,
    PAY_TO: payToResult,
    PAYMENT_REQUEST_VALID: requestResult,
    PAYMENT_ATTEMPTED: attemptedResult,
    PAYMENT_SETTLED: settledResult,
    SERVICE_RESULT_RECEIVED: serviceResult,
    TRANSFER_STATUS: transferResult,
    TX_HASH: hashResult,
    SELLER_RECEIPT_CONFIRMED: sellerReceipt,
    EVIDENCE_GAPS: gaps,
    CONTRADICTIONS: contradictions,
    LIKELY_FAILURE_LAYER: layer,
    NEXT_ACTION: action,
  };
}
