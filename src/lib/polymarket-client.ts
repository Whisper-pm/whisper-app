// Polymarket real integration — CLOB auth + order signing + testnet CTF

import { createHmac } from "crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type Account,
  type Chain,
} from "viem";
import { CONFIG } from "./config";

const polygonAmoy: Chain = {
  id: 80002,
  name: "Polygon Amoy",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: { default: { http: [CONFIG.chains.polygonAmoy.rpc] } },
};

// ========== CLOB AUTH (mainnet) ==========

export interface ClobCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

export async function deriveClobCredentials(
  walletClient: ReturnType<typeof createWalletClient>
): Promise<ClobCreds> {
  const address = walletClient.account!.address;
  const timestamp = String(Math.floor(Date.now() / 1000));

  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain: { name: "ClobAuthDomain", version: "1", chainId: 137 },
    types: CLOB_AUTH_TYPES,
    primaryType: "ClobAuth",
    message: {
      address,
      timestamp,
      nonce: 0n,
      message: "This message attests that I control the given wallet",
    },
  });

  const res = await fetch(`${CONFIG.polymarket.clobApi}/auth/derive-api-key`, {
    method: "GET",
    headers: {
      POLY_ADDRESS: address,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_NONCE: "0",
    },
  });

  if (!res.ok) throw new Error(`CLOB auth failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function hmacSign(secret: string, ts: string, method: string, path: string, body?: string): string {
  const msg = ts + method + path + (body ?? "");
  return createHmac("sha256", Buffer.from(secret, "base64")).update(msg).digest("base64url");
}

export function buildL2Headers(creds: ClobCreds, address: string, method: string, path: string, body?: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  return {
    POLY_ADDRESS: address,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
    POLY_SIGNATURE: hmacSign(creds.secret, ts, method, path, body),
    POLY_TIMESTAMP: ts,
    "Content-Type": "application/json",
  };
}

// ========== HEARTBEAT ==========

let heartbeatId: string | null = null;

export function startHeartbeat(creds: ClobCreds, address: string) {
  const beat = async () => {
    const path = "/v1/heartbeats";
    const body = heartbeatId ? JSON.stringify({ heartbeat_id: heartbeatId }) : "{}";
    const headers = buildL2Headers(creds, address, "POST", path, body);
    try {
      const res = await fetch(`${CONFIG.polymarket.clobApi}${path}`, { method: "POST", headers, body });
      if (res.ok) {
        const data = await res.json();
        heartbeatId = data.heartbeat_id ?? heartbeatId;
      }
    } catch { /* swallow */ }
  };
  beat();
  const interval = setInterval(beat, 9_000);
  return () => clearInterval(interval);
}

// ========== TESTNET CTF (Amoy) ==========

const ctfAbi = [
  { name: "prepareCondition", type: "function", stateMutability: "nonpayable", inputs: [{ name: "oracle", type: "address" }, { name: "questionId", type: "bytes32" }, { name: "outcomeSlotCount", type: "uint256" }], outputs: [] },
  { name: "splitPosition", type: "function", stateMutability: "nonpayable", inputs: [{ name: "collateralToken", type: "address" }, { name: "parentCollectionId", type: "bytes32" }, { name: "conditionId", type: "bytes32" }, { name: "partition", type: "uint256[]" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "reportPayouts", type: "function", stateMutability: "nonpayable", inputs: [{ name: "questionId", type: "bytes32" }, { name: "payouts", type: "uint256[]" }], outputs: [] },
  { name: "redeemPositions", type: "function", stateMutability: "nonpayable", inputs: [{ name: "collateralToken", type: "address" }, { name: "parentCollectionId", type: "bytes32" }, { name: "conditionId", type: "bytes32" }, { name: "indexSets", type: "uint256[]" }], outputs: [] },
] as const;

const erc20Abi = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { name: "faucet", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const ZERO_PARENT = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

export function createAmoyClients(account: Account) {
  return {
    publicClient: createPublicClient({ chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) }),
    walletClient: createWalletClient({ account, chain: polygonAmoy, transport: http(CONFIG.chains.polygonAmoy.rpc) }),
  };
}

export async function mintTestUsdc(account: Account) {
  const { walletClient, publicClient } = createAmoyClients(account);
  const hash = await walletClient.writeContract({
    address: CONFIG.polymarket.amoy.collateral,
    abi: erc20Abi,
    functionName: "faucet",
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function createTestMarket(account: Account, question: string) {
  const { walletClient, publicClient } = createAmoyClients(account);
  const oracle = account.address;
  const questionId = keccak256(encodePacked(["string"], [question]));
  const conditionId = keccak256(encodePacked(["address", "bytes32", "uint256"], [oracle, questionId, 2n]));

  const hash = await walletClient.writeContract({
    address: CONFIG.polymarket.amoy.ctf,
    abi: ctfAbi,
    functionName: "prepareCondition",
    args: [oracle, questionId, 2n],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { questionId, conditionId, oracle, txHash: hash };
}

export async function splitUsdc(account: Account, conditionId: `0x${string}`, amount: bigint) {
  const { walletClient, publicClient } = createAmoyClients(account);

  const approveHash = await walletClient.writeContract({
    address: CONFIG.polymarket.amoy.collateral,
    abi: erc20Abi,
    functionName: "approve",
    args: [CONFIG.polymarket.amoy.ctf, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const splitHash = await walletClient.writeContract({
    address: CONFIG.polymarket.amoy.ctf,
    abi: ctfAbi,
    functionName: "splitPosition",
    args: [CONFIG.polymarket.amoy.collateral, ZERO_PARENT, conditionId, [1n, 2n], amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: splitHash });
  return { approveHash, splitHash };
}

export async function resolveTestMarket(account: Account, questionId: `0x${string}`, yesWins: boolean) {
  const { walletClient, publicClient } = createAmoyClients(account);
  const hash = await walletClient.writeContract({
    address: CONFIG.polymarket.amoy.ctf,
    abi: ctfAbi,
    functionName: "reportPayouts",
    args: [questionId, yesWins ? [1n, 0n] : [0n, 1n]],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function redeemWinnings(account: Account, conditionId: `0x${string}`) {
  const { walletClient, publicClient } = createAmoyClients(account);
  const hash = await walletClient.writeContract({
    address: CONFIG.polymarket.amoy.ctf,
    abi: ctfAbi,
    functionName: "redeemPositions",
    args: [CONFIG.polymarket.amoy.collateral, ZERO_PARENT, conditionId, [1n, 2n]],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function getAmoyUsdcBalance(account: Account): Promise<bigint> {
  const { publicClient } = createAmoyClients(account);
  return publicClient.readContract({
    address: CONFIG.polymarket.amoy.collateral,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
}
