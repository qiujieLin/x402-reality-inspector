import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PaymentReceiptInput {
  transferId: string;
  network: string;
  amount: string;
  token: "USDC";
  fromAddress: string;
  toAddress: string;
  createdAt: string;
  paymentEndpoint: string;
  httpResult: { status: number; body?: unknown };
  txHash?: string | null;
  status?: string;
  // 这些字段只用于测试证明不会被持久化，不属于输出模型。
  authorizationSignature?: string;
  apiKey?: string;
}

export interface PersistReceiptResult {
  saved: boolean;
  path?: string;
}

function safeFileName(transferId: string): string | null {
  return /^[a-zA-Z0-9-]+$/.test(transferId) ? `${transferId}.json` : null;
}

export async function persistPaymentReceipt(
  input: PaymentReceiptInput,
  directory = join(process.cwd(), "artifacts", "payment-receipts"),
): Promise<PersistReceiptResult> {
  const fileName = safeFileName(input.transferId);
  if (!fileName) return { saved: false };

  // 只复制非敏感的可追踪字段，绝不接受或写入签名、密钥、token 等凭据。
  const receipt = {
    transferId: input.transferId,
    network: input.network,
    amount: input.amount,
    token: input.token,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    createdAt: input.createdAt,
    paymentEndpoint: input.paymentEndpoint,
    httpResult: input.httpResult,
    ...(input.txHash !== undefined ? { txHash: input.txHash } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  const path = join(directory, fileName);

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return { saved: true, path };
  } catch {
    // 记录失败不得改变付款或 Inspector 的业务结果。
    return { saved: false };
  }
}
