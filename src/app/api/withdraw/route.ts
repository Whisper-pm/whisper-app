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

function resolveWalletKey(address?: string): string | null {
  if (!address) return null;
  const keys = process.env.WALLET_KEYS ?? "";
  for (const pair of keys.split(",")) {
    const [addr, pk] = pair.split(":");
    if (addr?.toLowerCase() === address.toLowerCase()) return pk;
  }
  return null;
}

// Real withdraw from Unlink privacy pool
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, evmPrivateKey, evmAddress } = body;

  if (!amount) {
    return NextResponse.json({ error: "Missing amount" }, { status: 400 });
  }

  const pk = evmPrivateKey || resolveWalletKey(evmAddress);
  if (!pk) {
    return NextResponse.json({ error: "Wallet not registered for backend signing." }, { status: 400 });
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

    const result = await unlink.withdraw({
      recipientEvmAddress: account.address,
      token: CONFIG.unlink.usdc,
      amount,
    });

    await new Promise((r) => setTimeout(r, 5000));

    const balances = await unlink.getBalances();
    const usdcBal = ((balances as any).balances ?? []).find(
      (b: any) => b.token?.toLowerCase() === CONFIG.unlink.usdc.toLowerCase()
    );

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
