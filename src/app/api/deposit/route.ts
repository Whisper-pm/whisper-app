import { NextRequest, NextResponse } from "next/server";
import {
  createUnlink,
  unlinkAccount,
  unlinkEvm,
} from "@unlink-xyz/sdk";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { CONFIG } from "@/lib/config";
import crypto from "crypto";

// Permit2 nonce tracker — auto-increments to avoid desync bug in SDK
const nonceTracker = new Map<string, number>();
function getNextNonce(wallet: string): string {
  const current = nonceTracker.get(wallet.toLowerCase()) ?? 2000;
  nonceTracker.set(wallet.toLowerCase(), current + 1);
  return String(current);
}

// Resolve wallet address → private key from WALLET_KEYS env
// Format: WALLET_KEYS=address1:pk1,address2:pk2
function resolveWalletKey(address?: string): string | null {
  if (!address) return null;
  const keys = process.env.WALLET_KEYS ?? "";
  for (const pair of keys.split(",")) {
    const [addr, pk] = pair.split(":");
    if (addr?.toLowerCase() === address.toLowerCase()) return pk;
  }
  return null;
}

// Real deposit into Unlink privacy pool
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, evmPrivateKey, evmAddress } = body;

  if (!amount) {
    return NextResponse.json({ error: "Missing amount" }, { status: 400 });
  }

  // Resolve private key: explicit PK > wallet mapping from env
  const pk = evmPrivateKey || resolveWalletKey(evmAddress);
  if (!pk) {
    return NextResponse.json({ error: "Wallet not registered for backend signing. Add WALLET_KEYS in env." }, { status: 400 });
  }

  try {
    const account = privateKeyToAccount(pk as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });

    const seed = crypto.createHash("sha512").update("whisper:" + account.address).digest();
    const unlink = createUnlink({
      engineUrl: CONFIG.unlink.engineUrl,
      apiKey: CONFIG.unlink.apiKey,
      account: unlinkAccount.fromSeed({ seed: new Uint8Array(seed) }),
      evm: unlinkEvm.fromViem({ walletClient: walletClient as any, publicClient: publicClient as any }),
    });

    await unlink.ensureRegistered();

    // Ensure approval
    await unlink.ensureErc20Approval({
      token: CONFIG.unlink.usdc,
      amount: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    });

    // Deposit
    const nonce = getNextNonce(account.address);
    const result = await unlink.deposit({ token: CONFIG.unlink.usdc, amount, nonce });

    // Wait for balance
    await new Promise((r) => setTimeout(r, 8000));
    const balances = await unlink.getBalances();
    const usdcBal = ((balances as any).balances ?? []).find(
      (b: any) => b.token?.toLowerCase() === CONFIG.unlink.usdc.toLowerCase()
    );

    // On-chain balance
    const onChainBal = await publicClient.readContract({
      address: CONFIG.unlink.usdc,
      abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
      functionName: "balanceOf",
      args: [account.address],
    });

    return NextResponse.json({
      success: true,
      txId: result.txId,
      status: result.status,
      poolBalance: usdcBal ? formatUnits(BigInt(usdcBal.amount), 6) : "0",
      walletBalance: formatUnits(onChainBal, 6),
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
