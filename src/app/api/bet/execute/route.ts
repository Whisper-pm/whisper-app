import { NextRequest, NextResponse } from "next/server";
import {
  createUnlink,
  unlinkAccount,
  unlinkEvm,
  createUnlinkClient,
  BurnerWallet,
} from "@unlink-xyz/sdk";
import {
  createPublicClient,
  createWalletClient,
  http,
  pad,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { CONFIG } from "@/lib/config";
import { addBet } from "@/lib/store";
import { addBurner, updateBurner } from "@/lib/wallet-store";
import crypto from "crypto";

const USDC_BASE = CONFIG.unlink.usdc;
const USDC_AMOY = CONFIG.cctp.usdcPolygonAmoy;
const TOKEN_MESSENGER = CONFIG.cctp.tokenMessenger;
const TOKEN_MINTER = CONFIG.cctp.tokenMinter;
const MSG_TRANSMITTER = CONFIG.cctp.messageTransmitter;
const CTF = CONFIG.polymarket.amoy.ctf;

const erc20Abi = [
  { name: "approve", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "s", type: "address" as const }, { name: "a", type: "uint256" as const }], outputs: [{ type: "bool" as const }] },
  { name: "balanceOf", type: "function" as const, stateMutability: "view" as const, inputs: [{ type: "address" as const }], outputs: [{ type: "uint256" as const }] },
] as const;

const tmAbi = [{ name: "depositForBurn", type: "function" as const, stateMutability: "payable" as const, inputs: [{ name: "amount", type: "uint256" as const }, { name: "destinationDomain", type: "uint32" as const }, { name: "mintRecipient", type: "bytes32" as const }, { name: "burnToken", type: "address" as const }, { name: "destinationCaller", type: "bytes32" as const }, { name: "maxFee", type: "uint256" as const }, { name: "minFinalityThreshold", type: "uint32" as const }], outputs: [] }] as const;
const mtAbi = [{ name: "receiveMessage", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "message", type: "bytes" as const }, { name: "attestation", type: "bytes" as const }], outputs: [{ type: "bool" as const }] }] as const;
const ctfAbi = [
  { name: "prepareCondition", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "oracle", type: "address" as const }, { name: "questionId", type: "bytes32" as const }, { name: "outcomeSlotCount", type: "uint256" as const }], outputs: [] },
  { name: "splitPosition", type: "function" as const, stateMutability: "nonpayable" as const, inputs: [{ name: "collateralToken", type: "address" as const }, { name: "parentCollectionId", type: "bytes32" as const }, { name: "conditionId", type: "bytes32" as const }, { name: "partition", type: "uint256[]" as const }, { name: "amount", type: "uint256" as const }], outputs: [] },
] as const;

const amoyChain = { id: 80002, name: "Amoy" as const, nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, rpcUrls: { default: { http: [CONFIG.chains.polygonAmoy.rpc] } } };

// Execute the REAL bet pipeline: Unlink → Bridge → Polymarket
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { conditionId, side, amount, evmPrivateKey, nullifier, marketQuestion, odds } = body;

  if (!conditionId || !side || !amount || !evmPrivateKey) {
    return NextResponse.json({ error: "Missing conditionId, side, amount, or evmPrivateKey" }, { status: 400 });
  }

  const steps: Array<{ step: string; status: string; txHash?: string; detail?: string }> = [];
  const log = (step: string, status: string, txHash?: string, detail?: string) => {
    steps.push({ step, status, txHash, detail });
  };

  try {
    const account = privateKeyToAccount(evmPrivateKey as `0x${string}`);
    const basePub = createPublicClient({ chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
    const baseWallet = createWalletClient({ account, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
    const amoyPub = createPublicClient({ chain: amoyChain, transport: http(CONFIG.chains.polygonAmoy.rpc) });
    const amoyWallet = createWalletClient({ account, chain: amoyChain, transport: http(CONFIG.chains.polygonAmoy.rpc) });

    const amountBigint = BigInt(amount);

    // Step 1: Unlink deposit
    log("unlink:deposit", "started");
    const seed = crypto.createHash("sha512").update("whisper:bet:" + account.address).digest();
    const unlink = createUnlink({
      engineUrl: CONFIG.unlink.engineUrl,
      apiKey: CONFIG.unlink.apiKey,
      account: unlinkAccount.fromSeed({ seed: new Uint8Array(seed) }),
      evm: unlinkEvm.fromViem({ walletClient: baseWallet as any, publicClient: basePub as any }),
    });
    await unlink.ensureRegistered();
    const dep = await unlink.deposit({ token: USDC_BASE, amount: String(amountBigint) });
    log("unlink:deposit", "done", undefined, "txId: " + dep.txId);

    // Wait for balance
    await new Promise((r) => setTimeout(r, 8000));

    // Step 2: Create burner
    log("unlink:burner", "started");
    const burner = await BurnerWallet.create();
    const client = createUnlinkClient(CONFIG.unlink.engineUrl, CONFIG.unlink.apiKey);
    const keys = await unlinkAccount.fromSeed({ seed: new Uint8Array(seed) }).getAccountKeys();
    await burner.fundFromPool(client, { senderKeys: keys, token: USDC_BASE, amount: String(amountBigint), environment: "base-sepolia" });
    log("unlink:burner", "done", undefined, "burner: " + burner.address);

    // Track burner in JSON store
    const unlinkAddr = await unlink.getAddress();
    addBurner({
      burnerAddress: burner.address,
      createdAt: new Date().toISOString(),
      parentEvmAddress: account.address,
      unlinkAddress: unlinkAddr,
      market: marketQuestion,
      side,
      amount: formatUnits(amountBigint, 6),
      status: "funded",
      txHashes: {},
    });

    // Wait for burner funding
    await new Promise((r) => setTimeout(r, 8000));

    // Step 3: CCTP Bridge Base → Polygon
    log("cctp:bridge", "started");
    const burnerAccount = burner.toViemAccount();
    const burnerBaseWallet = createWalletClient({ account: burnerAccount, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });

    // Approve TokenMinter
    const approveTx = await burnerBaseWallet.writeContract({ address: USDC_BASE, abi: erc20Abi, functionName: "approve", args: [TOKEN_MINTER, amountBigint] });
    await basePub.waitForTransactionReceipt({ hash: approveTx });

    // Burn
    const recipient = pad(burnerAccount.address as `0x${string}`, { size: 32 });
    const zeroCaller = pad("0x0" as `0x${string}`, { size: 32 });
    const burnTx = await burnerBaseWallet.writeContract({
      address: TOKEN_MESSENGER, abi: tmAbi, functionName: "depositForBurn",
      args: [amountBigint, CONFIG.cctp.domains.polygonAmoy, recipient, USDC_BASE, zeroCaller, amountBigint / 50n, 1000],
    });
    await basePub.waitForTransactionReceipt({ hash: burnTx });
    log("cctp:burn", "done", burnTx);
    updateBurner(burner.address, { status: "bridged", txHashes: { cctpBurn: burnTx } });

    // Attestation
    const irisUrl = `${CONFIG.cctp.iris}/v2/messages/${CONFIG.cctp.domains.baseSepolia}?transactionHash=${burnTx}`;
    let attestation: { message: string; attestation: string } | null = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await fetch(irisUrl);
      if (res.ok) {
        const d = await res.json() as any;
        if (d?.messages?.[0]?.status === "complete") {
          attestation = d.messages[0];
          break;
        }
      }
    }
    if (!attestation) {
      log("cctp:attestation", "timeout");
      return NextResponse.json({ success: false, steps, error: "Attestation timeout" });
    }
    log("cctp:attestation", "done");

    // Receive on Polygon
    const burnerAmoyWallet = createWalletClient({ account: burnerAccount, chain: amoyChain, transport: http(CONFIG.chains.polygonAmoy.rpc) });
    const receiveTx = await burnerAmoyWallet.writeContract({
      address: MSG_TRANSMITTER, abi: mtAbi, functionName: "receiveMessage",
      args: [attestation.message as `0x${string}`, attestation.attestation as `0x${string}`],
    });
    await amoyPub.waitForTransactionReceipt({ hash: receiveTx });
    log("cctp:receive", "done", receiveTx);
    updateBurner(burner.address, { txHashes: { cctpReceive: receiveTx } });

    // Step 4: Prepare condition on Amoy testnet + split
    log("polymarket:prepare", "started");
    const { keccak256, encodePacked } = await import("viem");
    const questionText = marketQuestion || conditionId;
    const questionId = keccak256(encodePacked(["string"], [questionText]));
    const oracle = burnerAccount.address;
    const testnetConditionId = keccak256(encodePacked(["address", "bytes32", "uint256"], [oracle, questionId, 2n]));

    // prepareCondition on Amoy CTF (creates the condition if it doesn't exist)
    try {
      const prepareTx = await burnerAmoyWallet.writeContract({
        address: CTF, abi: ctfAbi, functionName: "prepareCondition",
        args: [oracle, questionId, 2n],
      });
      await amoyPub.waitForTransactionReceipt({ hash: prepareTx });
      log("polymarket:prepare", "done", prepareTx, "conditionId: " + testnetConditionId);
    } catch (e: any) {
      // Condition may already exist — that's fine
      log("polymarket:prepare", "exists", undefined, testnetConditionId);
    }

    // Approve + split on testnet
    log("polymarket:split", "started");
    await burnerAmoyWallet.writeContract({ address: USDC_AMOY, abi: erc20Abi, functionName: "approve", args: [CTF, amountBigint] });
    const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const splitTx = await burnerAmoyWallet.writeContract({
      address: CTF, abi: ctfAbi, functionName: "splitPosition",
      args: [USDC_AMOY, ZERO, testnetConditionId, [1n, 2n], amountBigint],
    });
    await amoyPub.waitForTransactionReceipt({ hash: splitTx });
    log("polymarket:split", "done", splitTx);
    updateBurner(burner.address, { status: "bet_placed", txHashes: { splitPosition: splitTx } });

    // Persist bet to in-memory store
    const amountUsdc = parseFloat(formatUnits(amountBigint, 6));
    let savedBet = null;
    if (nullifier) {
      savedBet = addBet(nullifier, {
        market: marketQuestion || `Market ${conditionId.substring(0, 10)}...`,
        conditionId,
        side,
        amount: amountUsdc,
        odds: odds || "50%",
        status: "active",
        burner: burner.address,
        txHash: splitTx,
      });
    }

    return NextResponse.json({
      success: true,
      steps,
      burner: burner.address,
      side,
      amount: formatUnits(amountBigint, 6) + " USDC",
      bet: savedBet,
    });
  } catch (e: any) {
    log("error", "failed", undefined, e.message);
    return NextResponse.json({ success: false, steps, error: e.message }, { status: 500 });
  }
}
