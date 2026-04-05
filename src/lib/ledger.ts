// Ledger integration via LedgerJS (hw-transport-webhid + hw-app-eth)
// Simple async/await approach — proven, battle-tested, works everywhere.

import { findDescriptor, resolveDisplayFields } from "@/erc7730";

/** AI analysis fields embedded into EIP-712 typed data for Ledger Clear Signing */
export interface LedgerAIAnalysis {
  aiScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  aiThesis: string;
  liquidityUsd: number;
}

export function formatThesisForLedger(thesis: string): string {
  if (!thesis) return "No analysis";
  const clean = thesis.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").trim();
  if (clean.length <= 60) return clean;
  return clean.slice(0, 57) + "...";
}

export function liquidityToMicroUsdc(liquidityUsd: number): string {
  return String(Math.floor(liquidityUsd * 1e6));
}

// ---- State ----

let transport: any = null;
let ethApp: any = null;
let connectedAddress: string | null = null;

// ---- Connection ----

export async function connectLedger(_method?: "usb" | "bluetooth"): Promise<string> {
  // LedgerJS: simple WebHID — opens browser device picker popup
  const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
  const Eth = (await import("@ledgerhq/hw-app-eth")).default;

  // Close any existing transport first
  if (transport) {
    try { await transport.close(); } catch {}
    transport = null;
    ethApp = null;
  }

  console.log("[Ledger] Opening WebHID transport...");
  transport = await TransportWebHID.create();
  console.log("[Ledger] Transport opened");

  ethApp = new Eth(transport);
  console.log("[Ledger] Ethereum app connected");

  // Get address to verify connection
  const { address } = await ethApp.getAddress("44'/60'/0'/0/0");
  connectedAddress = address.startsWith("0x") ? address : `0x${address}`;
  console.log("[Ledger] Address:", connectedAddress);

  return connectedAddress;
}

export async function getLedgerAddress(derivationPath = "44'/60'/0'/0/0"): Promise<string> {
  if (connectedAddress) return connectedAddress;
  if (!ethApp) throw new Error("Ledger not connected");
  const { address } = await ethApp.getAddress(derivationPath);
  connectedAddress = address.startsWith("0x") ? address : `0x${address}`;
  return connectedAddress;
}

export function isLedgerConnected(): boolean {
  return !!ethApp;
}

export async function disconnectLedger(): Promise<void> {
  if (transport) {
    await transport.close();
    transport = null;
    ethApp = null;
    connectedAddress = null;
  }
}

// ---- EIP-712 Signing ----

export async function signTypedDataOnLedger(
  derivationPath: string,
  typedData: any
): Promise<string> {
  if (!ethApp) throw new Error("Ledger not connected");

  // hw-app-eth signEIP712Message expects the full typed data object
  const { domain, types, primaryType, message } = typedData;

  const sig = await ethApp.signEIP712Message(derivationPath, {
    domain,
    types: { EIP712Domain: getDomainType(domain), ...types },
    primaryType,
    message,
  });

  return `0x${sig.r}${sig.s}${sig.v.toString(16).padStart(2, "0")}`;
}

function getDomainType(domain: Record<string, unknown>) {
  const fields: Array<{ name: string; type: string }> = [];
  if ("name" in domain) fields.push({ name: "name", type: "string" });
  if ("version" in domain) fields.push({ name: "version", type: "string" });
  if ("chainId" in domain) fields.push({ name: "chainId", type: "uint256" });
  if ("verifyingContract" in domain) fields.push({ name: "verifyingContract", type: "address" });
  if ("salt" in domain) fields.push({ name: "salt", type: "bytes32" });
  return fields;
}

// ---- Typed Data Builders ----

export function buildBetTypedData(params: {
  conditionId: string;
  side: "YES" | "NO";
  amount: string;
  market: string;
  aiScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  aiThesis: string;
  liquidityUsd: string;
}) {
  return {
    domain: {
      name: "Whisper Private Bet",
      version: "1",
      chainId: 84532,
    },
    types: {
      WhisperBet: [
        { name: "marketQuestion", type: "string" },
        { name: "conditionId", type: "bytes32" },
        { name: "side", type: "string" },
        { name: "amount", type: "uint256" },
        { name: "aiScore", type: "uint8" },
        { name: "riskLevel", type: "string" },
        { name: "aiThesis", type: "string" },
        { name: "liquidityUsd", type: "uint256" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "WhisperBet" as const,
    message: {
      marketQuestion: params.market,
      conditionId: params.conditionId,
      side: params.side,
      amount: params.amount,
      aiScore: params.aiScore,
      riskLevel: params.riskLevel,
      aiThesis: params.aiThesis,
      liquidityUsd: params.liquidityUsd,
      timestamp: Math.floor(Date.now() / 1000),
    },
  };
}

export function buildCTFOrderTypedData(params: {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: 0 | 1;
  signatureType: 0 | 1 | 2;
}) {
  return {
    domain: {
      name: "Polymarket CTF Exchange",
      version: "1",
      chainId: 137,
      verifyingContract: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
    },
    types: {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "signer", type: "address" },
        { name: "taker", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "feeRateBps", type: "uint256" },
        { name: "side", type: "uint8" },
        { name: "signatureType", type: "uint8" },
      ],
    },
    primaryType: "Order" as const,
    message: params,
  };
}

export function buildNegRiskOrderTypedData(params: {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: 0 | 1;
  signatureType: 0 | 1 | 2;
}) {
  return {
    domain: {
      name: "Polymarket Neg Risk CTF Exchange",
      version: "1",
      chainId: 137,
      verifyingContract: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
    },
    types: {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "signer", type: "address" },
        { name: "taker", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "feeRateBps", type: "uint256" },
        { name: "side", type: "uint8" },
        { name: "signatureType", type: "uint8" },
      ],
    },
    primaryType: "Order" as const,
    message: params,
  };
}

export function buildPermit2TypedData(params: {
  token: string;
  amount: string;
  expiration: number;
  nonce: number;
  spender: string;
  sigDeadline: number;
}) {
  return {
    domain: {
      name: "Permit2",
      chainId: 84532,
      verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    },
    types: {
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
    },
    primaryType: "PermitSingle" as const,
    message: {
      details: {
        token: params.token,
        amount: params.amount,
        expiration: params.expiration,
        nonce: params.nonce,
      },
      spender: params.spender,
      sigDeadline: params.sigDeadline,
    },
  };
}

export async function signBetWithLedger(params: {
  market: string;
  conditionId: string;
  side: "YES" | "NO";
  amount: string;
  aiScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  aiThesis: string;
  liquidityUsd: string;
  derivationPath?: string;
}) {
  const path = params.derivationPath ?? "44'/60'/0'/0/0";

  const typedData = buildBetTypedData({
    conditionId: params.conditionId,
    side: params.side,
    amount: params.amount,
    market: params.market,
    aiScore: params.aiScore,
    riskLevel: params.riskLevel,
    aiThesis: params.aiThesis,
    liquidityUsd: params.liquidityUsd,
  });

  const signature = await signTypedDataOnLedger(path, typedData);

  return {
    signature,
    typedData,
  };
}

export function previewLedgerDisplay(typedData: {
  domain?: { name?: string; verifyingContract?: string };
  primaryType?: string;
  message?: Record<string, unknown>;
}): Array<{ label: string; value: string }> | null {
  const descriptor = findDescriptor(typedData);
  if (!descriptor || !typedData.primaryType || !typedData.message) return null;
  return resolveDisplayFields(
    descriptor,
    typedData.primaryType,
    typedData.message
  );
}
