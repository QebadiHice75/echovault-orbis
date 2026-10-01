import { NextResponse } from "next/server";

import { CHAINS, type ChainKey, type VerifiedEvent } from "@/lib/echo";

export const runtime = "nodejs";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = `0x${"0".repeat(64)}`;

function hexToNumber(value: string | null | undefined) {
  if (!value) return 0;
  return Number.parseInt(value, 16);
}

function hexToBigInt(value: string | null | undefined) {
  try {
    return BigInt(value || "0x0");
  } catch {
    return 0n;
  }
}

function formatEther(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10n ** 18n;
  const fraction = (absolute % 10n ** 18n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const result = (await response.json()) as { result?: T; error?: { message?: string } };
  if (result.error) throw new Error(result.error.message || "RPC request failed");
  return result.result ?? null;
}

type RpcTransaction = {
  hash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  input: string;
  value: string;
};

type RpcReceipt = {
  status: string;
  gasUsed: string;
  logs: Array<{ topics: string[]; data: string; address: string }>;
};

type RpcBlock = { timestamp: string };

function classify(tx: RpcTransaction, receipt: RpcReceipt): VerifiedEvent["eventType"] {
  if (tx.to === null) return "contract-deployment";
  const transferLogs = receipt.logs.filter((log) => log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC);
  if (transferLogs.length) {
    const first = transferLogs[0];
    const fromTopic = first.topics[1]?.toLowerCase();
    const toTopic = first.topics[2]?.toLowerCase();
    if (fromTopic === ZERO_TOPIC) return "token-mint";
    if (toTopic === ZERO_TOPIC) return "token-burn";
    return "token-transfer";
  }
  if ((tx.input === "0x" || tx.input === "0x0") && hexToBigInt(tx.value) > 0n) return "native-transfer";
  return "contract-interaction";
}

export async function POST(request: Request) {
  let body: { hash?: unknown; chain?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hash = typeof body.hash === "string" ? body.hash.trim() : "";
  const chainKey = body.chain as ChainKey;
  const chain = CHAINS[chainKey];

  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return NextResponse.json({ error: "Enter a valid 66-character transaction hash." }, { status: 400 });
  }
  if (!chain) {
    return NextResponse.json({ error: "Unsupported network." }, { status: 400 });
  }

  try {
    const rpcUrl = chainKey === "base"
      ? process.env.BASE_RPC_URL || chain.rpcUrl
      : process.env.BASE_SEPOLIA_RPC_URL || chain.rpcUrl;
    const tx = await rpc<RpcTransaction>(rpcUrl, "eth_getTransactionByHash", [hash]);
    if (!tx) return NextResponse.json({ error: `Transaction not found on ${chain.name}.` }, { status: 404 });

    const receipt = await rpc<RpcReceipt>(rpcUrl, "eth_getTransactionReceipt", [hash]);
    if (!receipt) return NextResponse.json({ error: "Transaction receipt is not available yet." }, { status: 409 });

    const block = await rpc<RpcBlock>(rpcUrl, "eth_getBlockByNumber", [tx.blockNumber, false]);
    const blockNumber = hexToNumber(tx.blockNumber);
    const timestamp = block ? new Date(hexToNumber(block.timestamp) * 1000).toISOString() : new Date().toISOString();

    const event: VerifiedEvent = {
      hash: tx.hash,
      chain: chain.key,
      chainName: chain.name,
      chainId: chain.chainId,
      blockNumber,
      timestamp,
      from: tx.from,
      to: tx.to,
      valueEth: formatEther(hexToBigInt(tx.value)),
      gasUsed: hexToBigInt(receipt.gasUsed).toString(),
      success: receipt.status !== "0x0",
      methodSelector: tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : "0x",
      eventType: classify(tx, receipt),
      logCount: receipt.logs.length,
      explorerUrl: `${chain.explorerUrl}/tx/${tx.hash}`,
    };

    return NextResponse.json({ event }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("EchoVault transaction lookup failed", caught);
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not read this transaction." },
      { status: 502 },
    );
  }
}
