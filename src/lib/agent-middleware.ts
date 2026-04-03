// World Agent Kit x402 middleware
// Protects API endpoints: agents must be registered in AgentBook + pay per request

import { NextRequest, NextResponse } from "next/server";

const FREE_USES = 3;

interface AgentVerification {
  isAgent: boolean;
  isHumanBacked: boolean;
  walletAddress: string | null;
  freeUsesRemaining: number;
}

// In-memory usage tracking (resets on server restart — use DB in production)
const usageMap = new Map<string, number>();

function loadUsage(): Record<string, number> {
  const obj: Record<string, number> = {};
  usageMap.forEach((v, k) => { obj[k] = v; });
  return obj;
}

function saveUsage(data: Record<string, number>) {
  Object.entries(data).forEach(([k, v]) => usageMap.set(k, v));
}

/**
 * Verify if a request comes from a registered agent.
 * Checks x-agent-wallet header and AgentBook registration.
 */
export async function verifyAgent(req: NextRequest): Promise<AgentVerification> {
  const agentWallet = req.headers.get("x-agent-wallet");
  if (!agentWallet) {
    return { isAgent: false, isHumanBacked: false, walletAddress: null, freeUsesRemaining: 0 };
  }

  // TODO: Production — verify against AgentBook on World Chain
  // import { createPublicClient, http } from "viem";
  // const client = createPublicClient({ chain: worldChain, transport: http() });
  // const isRegistered = await client.readContract({
  //   address: AGENTBOOK_ADDRESS,
  //   abi: agentBookAbi,
  //   functionName: "isRegistered",
  //   args: [agentWallet],
  // });
  const isRegistered = true;

  const usage = loadUsage();
  const uses = usage[agentWallet] ?? 0;
  const paymentHeader = req.headers.get("x-payment");

  // Check if free trial exhausted AND no payment
  if (uses >= FREE_USES && !paymentHeader) {
    return { isAgent: true, isHumanBacked: isRegistered, walletAddress: agentWallet, freeUsesRemaining: 0 };
  }

  // Increment usage AFTER granting access (only for free uses, not paid)
  if (!paymentHeader) {
    usage[agentWallet] = uses + 1;
    saveUsage(usage);
  }

  const freeUsesRemaining = Math.max(0, FREE_USES - uses - 1);
  return { isAgent: true, isHumanBacked: isRegistered, walletAddress: agentWallet, freeUsesRemaining };
}

/**
 * Build a 402 Payment Required response.
 */
export function paymentRequiredResponse() {
  return NextResponse.json(
    {
      error: "Payment required",
      protocol: "x402",
      payment: {
        price: "10000",
        currency: "USDC",
        network: "eip155:84532",
        recipient: "0x0000000000000000000000000000000000000000",
        description: "Pay to place a bet via Whisper Agent API",
      },
    },
    { status: 402, headers: { "X-Payment-Required": "true" } }
  );
}
