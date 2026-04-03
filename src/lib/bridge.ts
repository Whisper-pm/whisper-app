// CCTP V2 Bridge — real Base Sepolia ↔ Polygon Amoy USDC transfer

import {
  createPublicClient,
  createWalletClient,
  http,
  pad,
  type Account,
  type Chain,
} from "viem";
import { baseSepolia } from "viem/chains";
import { CONFIG } from "./config";

const polygonAmoy: Chain = {
  id: 80002,
  name: "Polygon Amoy",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.chains.polygonAmoy.rpc] } },
};

const tokenMessengerAbi = [
  {
    name: "depositForBurn",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

const messageTransmitterAbi = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Bridge USDC from Base Sepolia to Polygon Amoy via CCTP V2 Fast Transfer.
 */
export async function bridgeBaseToPolygon(
  burnerAccount: Account,
  amount: bigint,
  onStatus?: (status: string) => void
) {
  const srcPublic = createPublicClient({ chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
  const srcWallet = createWalletClient({ account: burnerAccount, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
  const dstPublic = createPublicClient({ chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) });
  const dstWallet = createWalletClient({ account: burnerAccount, chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) });

  // 1. Approve USDC for TokenMessenger
  onStatus?.("Approving USDC...");
  const approveHash = await srcWallet.writeContract({
    address: CONFIG.cctp.usdcBaseSepolia,
    abi: erc20Abi,
    functionName: "approve",
    args: [CONFIG.cctp.tokenMessenger, amount],
  });
  await srcPublic.waitForTransactionReceipt({ hash: approveHash });

  // 2. Burn on Base Sepolia
  onStatus?.("Burning USDC on Base...");
  const mintRecipient = pad(burnerAccount.address as `0x${string}`, { size: 32 });
  const zeroCaller = pad("0x0" as `0x${string}`, { size: 32 });
  const maxFee = amount / 100n; // 1% max fee

  const burnHash = await srcWallet.writeContract({
    address: CONFIG.cctp.tokenMessenger,
    abi: tokenMessengerAbi,
    functionName: "depositForBurn",
    args: [amount, CONFIG.cctp.domains.polygonAmoy, mintRecipient, CONFIG.cctp.usdcBaseSepolia, zeroCaller, maxFee, 1000],
  });
  await srcPublic.waitForTransactionReceipt({ hash: burnHash });

  // 3. Poll attestation
  onStatus?.("Waiting for attestation (~15s)...");
  const attestation = await pollAttestation(CONFIG.cctp.domains.baseSepolia, burnHash);

  // 4. Receive on Polygon
  onStatus?.("Minting USDC on Polygon...");
  const receiveHash = await dstWallet.writeContract({
    address: CONFIG.cctp.messageTransmitter,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [attestation.message, attestation.attestation],
  });
  await dstPublic.waitForTransactionReceipt({ hash: receiveHash });

  onStatus?.("Bridge complete!");
  return { burnHash, receiveHash };
}

/**
 * Bridge USDC from Polygon Amoy back to Base Sepolia.
 */
export async function bridgePolygonToBase(
  burnerAccount: Account,
  amount: bigint,
  onStatus?: (status: string) => void
) {
  const srcPublic = createPublicClient({ chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) });
  const srcWallet = createWalletClient({ account: burnerAccount, chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) });
  const dstPublic = createPublicClient({ chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });
  const dstWallet = createWalletClient({ account: burnerAccount, chain: baseSepolia, transport: http(CONFIG.chains.baseSepolia.rpc) });

  onStatus?.("Approving USDC on Polygon...");
  const approveHash = await srcWallet.writeContract({
    address: CONFIG.cctp.usdcPolygonAmoy,
    abi: erc20Abi,
    functionName: "approve",
    args: [CONFIG.cctp.tokenMessenger, amount],
  });
  await srcPublic.waitForTransactionReceipt({ hash: approveHash });

  onStatus?.("Burning USDC on Polygon...");
  const mintRecipient = pad(burnerAccount.address as `0x${string}`, { size: 32 });
  const zeroCaller = pad("0x0" as `0x${string}`, { size: 32 });
  const maxFee = amount / 100n;

  const burnHash = await srcWallet.writeContract({
    address: CONFIG.cctp.tokenMessenger,
    abi: tokenMessengerAbi,
    functionName: "depositForBurn",
    args: [amount, CONFIG.cctp.domains.baseSepolia, mintRecipient, CONFIG.cctp.usdcPolygonAmoy, zeroCaller, maxFee, 1000],
  });
  await srcPublic.waitForTransactionReceipt({ hash: burnHash });

  onStatus?.("Waiting for attestation...");
  const attestation = await pollAttestation(CONFIG.cctp.domains.polygonAmoy, burnHash);

  onStatus?.("Minting USDC on Base...");
  const receiveHash = await dstWallet.writeContract({
    address: CONFIG.cctp.messageTransmitter,
    abi: messageTransmitterAbi,
    functionName: "receiveMessage",
    args: [attestation.message, attestation.attestation],
  });
  await dstPublic.waitForTransactionReceipt({ hash: receiveHash });

  onStatus?.("Bridge complete!");
  return { burnHash, receiveHash };
}

async function pollAttestation(
  sourceDomain: number,
  txHash: string
): Promise<{ message: `0x${string}`; attestation: `0x${string}` }> {
  const url = `${CONFIG.cctp.iris}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const deadline = Date.now() + 300_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const msg = (data as any)?.messages?.[0];
        if (msg?.status === "complete") {
          return { message: msg.message, attestation: msg.attestation };
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Attestation timeout");
}

/**
 * Get USDC balance on Polygon Amoy for an address.
 */
export async function getPolygonUsdcBalance(address: `0x${string}`): Promise<bigint> {
  const client = createPublicClient({ chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) });
  return client.readContract({
    address: CONFIG.cctp.usdcPolygonAmoy,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}
