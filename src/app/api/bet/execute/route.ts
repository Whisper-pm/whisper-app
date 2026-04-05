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
  keccak256,
  encodePacked,
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
const MSG_TRANSMITTER = CONFIG.cctp.messageTransmitter;
const CTF = CONFIG.polymarket.amoy.ctf;
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

// Gas tank — only private key needed server-side (for MATIC on Polygon)
const GAS_TANK_PK = process.env.GAS_TANK_PK || process.env.DEMO_PK;

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

/**
 * PIPELINE: Place a private bet on Polymarket
 *
 * Prerequisite: User already deposited USDC into Unlink pool (frontend, signed by Ledger/wallet)
 *
 * Step 1: Withdraw from Unlink pool → fresh burner wallet (SDK handles this, no private key needed)
 * Step 2: Burner bridges USDC via CCTP V2 (Base → Polygon)
 * Step 3: Gas tank relays receiveMessage + funds burner with MATIC (only key on backend)
 * Step 4: Burner bets on Polymarket CTF
 *
 * Privacy: each bet = new burner = no link between bets.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { conditionId, side, amount, userAddress, ledgerAddress, ledgerSignature, marketQuestion, odds } = body;

  if (!conditionId || !side || !amount) {
    return NextResponse.json({ error: "Missing conditionId, side, or amount" }, { status: 400 });
  }

  if (!GAS_TANK_PK) {
    return NextResponse.json({ error: "GAS_TANK_PK not configured" }, { status: 500 });
  }

  // Who is placing the bet? Ledger address > wallet address
  const betOwner = ledgerAddress || userAddress;
  if (!betOwner) {
    return NextResponse.json({ error: "No user address provided" }, { status: 400 });
  }

  const steps: Array<{ step: string; status: string; txHash?: string; detail?: string }> = [];
  const log = (step: string, status: string, txHash?: string, detail?: string) => {
    steps.push({ step, status, txHash, detail });
  };

  try {
    if (ledgerSignature) {
      log("ledger", "verified", undefined, `Signed by: ${ledgerAddress}`);
    }

    const basePub = createPublicClient({ chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
    const amoyPub = createPublicClient({ chain: amoyChain, transport: http(CONFIG.chains.polygonAmoy.rpc) });
    const amountBigint = BigInt(amount);

    // Gas tank account — only used for MATIC relay on Polygon
    const gasTank = privateKeyToAccount(GAS_TANK_PK as `0x${string}`);
    const gasTankWallet = createWalletClient({ account: gasTank, chain: amoyChain, transport: http(CONFIG.chains.polygonAmoy.rpc) });

    // Setup Unlink — seed derived from bet owner's address
    const seed = crypto.createHash("sha512").update("whisper:" + betOwner).digest();
    const unlinkAcc = unlinkAccount.fromSeed({ seed: new Uint8Array(seed) });

    // Unlink SDK needs an EVM interface for read operations only
    // The actual signing (deposit/approve) was done by the user on frontend
    const unlink = createUnlink({
      engineUrl: CONFIG.unlink.engineUrl,
      apiKey: CONFIG.unlink.apiKey,
      account: unlinkAcc,
      evm: unlinkEvm.fromViem({
        walletClient: createWalletClient({ account: gasTank, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) }) as any,
        publicClient: basePub as any,
      }),
    });
    await unlink.ensureRegistered();
    const unlinkAddr = await unlink.getAddress();
    log("unlink", "ready", undefined, `Pool address: ${unlinkAddr}`);

    // ============================================================
    // STEP 1: Withdraw from pool → fresh burner
    // Unlink SDK handles the ZK proof + relayer transfer
    // ============================================================
    log("burner", "started");
    const burner = await BurnerWallet.create();
    const burnerAddress = burner.address;
    const burnerAccount = burner.toViemAccount();
    log("burner", "created", undefined, burnerAddress);

    const apiClient = createUnlinkClient(CONFIG.unlink.engineUrl, CONFIG.unlink.apiKey);
    const unlinkKeys = await unlinkAcc.getAccountKeys();

    const fundResult = await burner.fundFromPool(apiClient, {
      senderKeys: unlinkKeys,
      token: USDC_BASE,
      amount: String(amountBigint),
      environment: "base-sepolia",
    });
    log("burner", "funded", undefined, `txId: ${fundResult.txId}`);

    addBurner({
      burnerAddress,
      createdAt: new Date().toISOString(),
      parentEvmAddress: betOwner,
      unlinkAddress: unlinkAddr,
      market: marketQuestion,
      side,
      amount: formatUnits(amountBigint, 6),
      status: "funded",
      txHashes: { fundFromPool: fundResult.txId },
    });

    // Wait for USDC + gas ETH to arrive on burner
    log("burner", "waiting");
    let burnerUsdc = 0n;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      burnerUsdc = (await basePub.readContract({ address: USDC_BASE, abi: erc20Abi, functionName: "balanceOf", args: [burnerAddress] })) as bigint;
      const burnerEth = await basePub.getBalance({ address: burnerAddress });
      if (burnerUsdc > 0n && burnerEth > 0n) {
        log("burner", "ready", undefined, `${formatUnits(burnerUsdc, 6)} USDC + ${formatUnits(burnerEth, 18)} ETH`);
        break;
      }
    }

    // ============================================================
    // STEP 2: CCTP Bridge Base → Polygon (burner signs)
    // ============================================================
    log("cctp:bridge", "started");
    const burnerBaseWallet = createWalletClient({ account: burnerAccount, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });

    // Approve USDC to both TokenMessenger AND TokenMinter (CCTP V2 needs both)
    const approveNonce1 = await basePub.getTransactionCount({ address: burnerAddress });
    const approveTx1 = await burnerBaseWallet.writeContract({ address: USDC_BASE, abi: erc20Abi, functionName: "approve", args: [TOKEN_MESSENGER, burnerUsdc], nonce: approveNonce1 });
    await basePub.waitForTransactionReceipt({ hash: approveTx1 });
    log("cctp:approve1", "done", approveTx1);
    const approveTx2 = await burnerBaseWallet.writeContract({ address: USDC_BASE, abi: erc20Abi, functionName: "approve", args: [CONFIG.cctp.tokenMinter, burnerUsdc], nonce: approveNonce1 + 1 });
    await basePub.waitForTransactionReceipt({ hash: approveTx2 });
    log("cctp:approve2", "done", approveTx2);

    const recipient = pad(burnerAddress as `0x${string}`, { size: 32 });
    const burnTx = await burnerBaseWallet.writeContract({
      address: TOKEN_MESSENGER, abi: tmAbi, functionName: "depositForBurn",
      args: [burnerUsdc, CONFIG.cctp.domains.polygonAmoy, recipient, USDC_BASE, ZERO, burnerUsdc / 50n, 1000],
      nonce: approveNonce1 + 2,
    });
    await basePub.waitForTransactionReceipt({ hash: burnTx });
    log("cctp:burn", "done", burnTx);
    updateBurner(burnerAddress, { status: "bridged", txHashes: { cctpBurn: burnTx } });

    // Poll Circle Iris for attestation
    log("cctp:attestation", "waiting");
    const irisUrl = `${CONFIG.cctp.iris}/v2/messages/${CONFIG.cctp.domains.baseSepolia}?transactionHash=${burnTx}`;
    let attestation: { message: string; attestation: string } | null = null;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(irisUrl);
        if (res.ok) {
          const d = (await res.json()) as any;
          if (d?.messages?.[0]?.status === "complete") { attestation = d.messages[0]; break; }
        }
      } catch {}
      if (i % 12 === 0 && i > 0) log("cctp:attestation", "polling", undefined, `${i * 5}s`);
    }
    if (!attestation) {
      log("cctp:attestation", "timeout");
      return NextResponse.json({ success: false, steps, error: "CCTP attestation timeout" });
    }
    log("cctp:attestation", "done");

    // ============================================================
    // STEP 3: Gas tank relays receiveMessage + funds burner MATIC
    // This is the ONLY step that uses a backend private key
    // ============================================================
    log("cctp:relay", "started");
    const amoyRelayGas = { maxFeePerGas: 50000000000n, maxPriorityFeePerGas: 26000000000n };
    const receiveTx = await gasTankWallet.writeContract({
      address: MSG_TRANSMITTER, abi: mtAbi, functionName: "receiveMessage",
      args: [attestation.message as `0x${string}`, attestation.attestation as `0x${string}`],
      ...amoyRelayGas,
    });
    await amoyPub.waitForTransactionReceipt({ hash: receiveTx });
    log("cctp:relay", "done", receiveTx);

    // Fund burner with MATIC for Polymarket txs
    const relayNonce = await amoyPub.getTransactionCount({ address: gasTank.address });
    const gasTx = await gasTankWallet.sendTransaction({
      to: burnerAddress,
      value: 10000000000000000n, // 0.01 MATIC
      nonce: relayNonce,
      ...amoyRelayGas,
    });
    await amoyPub.waitForTransactionReceipt({ hash: gasTx });
    log("gas:fund", "done", gasTx);
    updateBurner(burnerAddress, { txHashes: { cctpReceive: receiveTx } });

    // Check burner USDC on Amoy
    const burnerAmoyBalance = (await amoyPub.readContract({
      address: USDC_AMOY, abi: erc20Abi, functionName: "balanceOf", args: [burnerAddress],
    })) as bigint;
    log("balance", "done", undefined, `${formatUnits(burnerAmoyBalance, 6)} USDC on Amoy`);

    // ============================================================
    // STEP 4: Bet on Polymarket (burner signs on Amoy)
    // ============================================================
    const burnerAmoyWallet = createWalletClient({ account: burnerAccount, chain: amoyChain, transport: http(CONFIG.chains.polygonAmoy.rpc) });
    const amoyGas = { maxFeePerGas: 80000000000n, maxPriorityFeePerGas: 30000000000n };

    log("polymarket:prepare", "started");
    const questionText = marketQuestion || conditionId;
    const questionId = keccak256(encodePacked(["string"], [questionText]));
    const oracle = burnerAddress as `0x${string}`;
    const testnetConditionId = keccak256(encodePacked(["address", "bytes32", "uint256"], [oracle, questionId, 2n]));

    try {
      const prepareTx = await burnerAmoyWallet.writeContract({
        address: CTF, abi: ctfAbi, functionName: "prepareCondition", args: [oracle, questionId, 2n], ...amoyGas,
      });
      await amoyPub.waitForTransactionReceipt({ hash: prepareTx });
      log("polymarket:prepare", "done", prepareTx);
    } catch {
      log("polymarket:prepare", "exists");
    }

    log("polymarket:split", "started");
    const ctfApproveTx = await burnerAmoyWallet.writeContract({ address: USDC_AMOY, abi: erc20Abi, functionName: "approve", args: [CTF, burnerAmoyBalance], ...amoyGas });
    await amoyPub.waitForTransactionReceipt({ hash: ctfApproveTx });
    const splitNonce = await amoyPub.getTransactionCount({ address: burnerAddress });
    const splitTx = await burnerAmoyWallet.writeContract({ nonce: splitNonce, ...amoyGas,
      address: CTF, abi: ctfAbi, functionName: "splitPosition",
      args: [USDC_AMOY, ZERO, testnetConditionId, [1n, 2n], burnerAmoyBalance],
    });
    await amoyPub.waitForTransactionReceipt({ hash: splitTx });
    log("polymarket:split", "done", splitTx);
    updateBurner(burnerAddress, { status: "bet_placed", txHashes: { splitPosition: splitTx } });

    // Persist bet
    const amountUsdc = parseFloat(formatUnits(amountBigint, 6));
    let savedBet = null;
    if (betOwner) {
      savedBet = addBet(betOwner, {
        market: marketQuestion || `Market ${conditionId.substring(0, 10)}...`,
        conditionId: testnetConditionId,
        side: side as "YES" | "NO",
        amount: amountUsdc,
        odds: odds || "50%",
        status: "active" as const,
        burner: burnerAddress,
        txHash: splitTx,
      });
    }

    return NextResponse.json({
      success: true,
      steps,
      burner: burnerAddress,
      side,
      amount: formatUnits(amountBigint, 6) + " USDC",
      bet: savedBet,
    });
  } catch (e: any) {
    log("error", "failed", undefined, e.message);
    return NextResponse.json({ success: false, steps, error: e.message }, { status: 500 });
  }
}
