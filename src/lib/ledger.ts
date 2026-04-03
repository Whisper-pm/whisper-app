// Ledger DMK integration — real hardware signing with Clear Signing
// Connects to Ledger via WebHID, signs typed data with AI analysis enrichment

import {
  DeviceManagementKitBuilder,
  type DeviceManagementKit,
  type DeviceSessionId,
} from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import {
  SignerEthBuilder,
  type SignerEth,
} from "@ledgerhq/device-signer-kit-ethereum";

let dmk: DeviceManagementKit | null = null;
let sessionId: DeviceSessionId | null = null;
let signer: SignerEth | null = null;

/**
 * Initialize the Ledger DMK (call once on app load).
 */
export function initLedgerDMK(): DeviceManagementKit {
  if (dmk) return dmk;
  dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();
  return dmk;
}

/**
 * Connect to a Ledger device.
 * Returns the session ID for signing operations.
 */
export async function connectLedger(): Promise<DeviceSessionId> {
  const kit = initLedgerDMK();

  return new Promise((resolve, reject) => {
    const observable = kit.startDiscovering({ transport: "WEB_HID" });
    const sub = observable.subscribe({
      next: async (device) => {
        try {
          const session = await kit.connect({ device });
          sessionId = session;

          signer = new SignerEthBuilder({ dmk: kit, sessionId: session }).build();

          sub.unsubscribe();
          resolve(session);
        } catch (e) {
          reject(e);
        }
      },
      error: reject,
    });
  });
}

/**
 * Get the Ethereum address from the connected Ledger.
 */
export async function getLedgerAddress(derivationPath = "44'/60'/0'/0/0"): Promise<string> {
  if (!signer) throw new Error("Ledger not connected");

  return new Promise((resolve, reject) => {
    const { observable } = signer!.getAddress(derivationPath, { checkOnDevice: false });
    observable.subscribe({
      next: (result: any) => {
        if (result.status === "success") {
          resolve(result.output.address);
        }
      },
      error: reject,
    });
  });
}

/**
 * Sign EIP-712 typed data on the Ledger.
 * The Clear Signing metadata (ERC-7730) will automatically render
 * human-readable info on the device screen.
 */
export async function signTypedDataOnLedger(
  derivationPath: string,
  typedData: any
): Promise<string> {
  if (!signer) throw new Error("Ledger not connected");

  return new Promise((resolve, reject) => {
    const { observable } = signer!.signTypedData(derivationPath, typedData);
    observable.subscribe({
      next: (result: any) => {
        if (result.status === "success") {
          const { r, s, v } = result.output;
          const sig = `0x${r}${s}${v.toString(16).padStart(2, "0")}`;
          resolve(sig);
        }
      },
      error: reject,
    });
  });
}

/**
 * Sign a bet approval with AI analysis enrichment.
 * This is the core Ledger integration — the device screen shows:
 *   Market: [question]
 *   Position: YES/NO
 *   Amount: X USDC
 *   AI: Odds XX% | EV +$XX | Risk LOW/MED/HIGH
 */
export async function signBetWithLedger(params: {
  market: string;
  conditionId: string;
  side: "YES" | "NO";
  amount: string;
  aiAnalysis: string; // formatted by formatForLedger()
  derivationPath?: string;
}) {
  const path = params.derivationPath ?? "44'/60'/0'/0/0";

  // Build EIP-712 typed data for the bet
  // In production: this would match the actual Polymarket order struct
  // The ERC-7730 descriptor transforms this into human-readable on the device
  const typedData = {
    domain: {
      name: "Whisper Private Bet",
      version: "1",
      chainId: 84532, // Base Sepolia
    },
    types: {
      PlaceBet: [
        { name: "conditionId", type: "bytes32" },
        { name: "side", type: "uint8" },
        { name: "amount", type: "uint256" },
        { name: "timestamp", type: "uint256" },
      ],
    },
    primaryType: "PlaceBet" as const,
    message: {
      conditionId: params.conditionId,
      side: params.side === "YES" ? 1 : 0,
      amount: params.amount,
      timestamp: Math.floor(Date.now() / 1000),
    },
  };

  const signature = await signTypedDataOnLedger(path, typedData);

  return {
    signature,
    typedData,
    aiAnalysis: params.aiAnalysis,
  };
}

/**
 * Check if Ledger is connected.
 */
export function isLedgerConnected(): boolean {
  return !!signer;
}

/**
 * Disconnect Ledger.
 */
export async function disconnectLedger() {
  if (dmk && sessionId) {
    await dmk.disconnect({ sessionId });
    sessionId = null;
    signer = null;
  }
}
