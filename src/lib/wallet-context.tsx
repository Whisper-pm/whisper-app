"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useWalletClient } from "wagmi";

/**
 * Unified wallet context — one source of truth for "who is connected"
 *
 * Either the user connects via:
 * - Ledger (USB/BLE via WebHID) → ledgerAddress is set
 * - Browser wallet (MetaMask/Rabby via Reown) → wagmi address is set
 *
 * Components use `activeAddress` and `walletType` to adapt behavior.
 */

type WalletType = "ledger" | "browser" | null;

interface WalletState {
  // The active address — whichever wallet is connected
  activeAddress: string | null;
  // Which type of wallet
  walletType: WalletType;
  // Is any wallet connected?
  isConnected: boolean;
  // Ledger-specific
  ledgerAddress: string | null;
  connectLedger: () => Promise<void>;
  disconnectLedger: () => Promise<void>;
  isLedgerConnected: boolean;
  // Browser wallet (from wagmi/Reown)
  browserAddress: string | undefined;
  isBrowserConnected: boolean;
  walletClient: any;
}

const WalletContext = createContext<WalletState>({
  activeAddress: null,
  walletType: null,
  isConnected: false,
  ledgerAddress: null,
  connectLedger: async () => {},
  disconnectLedger: async () => {},
  isLedgerConnected: false,
  browserAddress: undefined,
  isBrowserConnected: false,
  walletClient: null,
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: browserAddress, isConnected: isBrowserConnected } = useAppKitAccount();
  const { data: walletClient } = useWalletClient();
  const [ledgerAddress, setLedgerAddress] = useState<string | null>(null);

  const connectLedgerFn = useCallback(async () => {
    const { connectLedger: connect } = await import("@/lib/ledger");
    const addr = await connect();
    setLedgerAddress(addr);
  }, []);

  const disconnectLedgerFn = useCallback(async () => {
    const { disconnectLedger: disconnect } = await import("@/lib/ledger");
    await disconnect();
    setLedgerAddress(null);
  }, []);

  const isLedgerConnected = !!ledgerAddress;

  // Ledger takes priority if connected
  const walletType: WalletType = isLedgerConnected ? "ledger" : isBrowserConnected ? "browser" : null;
  const activeAddress = ledgerAddress || (isBrowserConnected ? browserAddress : null) || null;

  return (
    <WalletContext.Provider value={{
      activeAddress,
      walletType,
      isConnected: !!activeAddress,
      ledgerAddress,
      connectLedger: connectLedgerFn,
      disconnectLedger: disconnectLedgerFn,
      isLedgerConnected,
      browserAddress,
      isBrowserConnected,
      walletClient,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
