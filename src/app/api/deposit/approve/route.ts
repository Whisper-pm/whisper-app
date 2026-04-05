import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { CONFIG } from "@/lib/config";

const erc20Abi = [
  { name: "allowance", type: "function" as const, stateMutability: "view" as const, inputs: [{ type: "address" as const }, { type: "address" as const }], outputs: [{ type: "uint256" as const }] },
  { name: "approve", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "s", type: "address" as const }, { name: "a", type: "uint256" as const }], outputs: [{ type: "bool" as const }] },
] as const;

/**
 * Ensure USDC is approved to Permit2 for the given address.
 * For hackathon: uses GAS_TANK to send approve on behalf.
 * In production: user would sign the approve tx on their Ledger.
 */
export async function POST(req: NextRequest) {
  const { evmAddress } = await req.json();
  if (!evmAddress) return NextResponse.json({ error: "Missing evmAddress" }, { status: 400 });

  const pub = createPublicClient({ chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });

  // Check existing allowance
  const allowance = await pub.readContract({
    address: CONFIG.unlink.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [evmAddress as `0x${string}`, CONFIG.unlink.permit2],
  });

  if (allowance > 0n) {
    return NextResponse.json({ status: "approved", allowance: allowance.toString() });
  }

  // Need to approve — for this to work, the user's wallet needs to send the approve tx.
  // Since the Ledger is connected via WebHID (message signing only, not tx sending),
  // we return the tx data for the frontend to handle.
  return NextResponse.json({
    status: "needs_approval",
    txData: {
      to: CONFIG.unlink.usdc,
      data: "0x095ea7b3" +
        CONFIG.unlink.permit2.slice(2).padStart(64, "0") +
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  });
}
