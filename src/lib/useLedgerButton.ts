"use client";

import { useEffect, useState, useRef } from "react";

const LEDGER_CONFIG = {
  dAppIdentifier: "whisper",
  apiKey: "1e55ba3959f4543af24809d9066a2120bd2ac9246e626e26a1ff77eb109ca0e5",
  buttonPosition: "bottom-right" as const,
  logLevel: "info" as const,
  environment: "production" as const,
};

/**
 * Initialize the Ledger Button (wallet provider).
 * This injects a floating Ledger button and registers as an EIP-6963 provider.
 * Reown/AppKit will automatically detect it alongside MetaMask, Rabby, etc.
 *
 * When user connects via the Ledger Button:
 * - Ledger device signs all transactions
 * - ERC-7730 Clear Signing shows AI analysis on device screen
 * - originToken authorizes custom metadata display
 */
export function useLedgerButton() {
  const [ready, setReady] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("@ledgerhq/ledger-wallet-provider").then((module) => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }

      const cleanup = module.initializeLedgerProvider({
        target: document.body,
        floatingButtonPosition: LEDGER_CONFIG.buttonPosition,
        dAppIdentifier: LEDGER_CONFIG.dAppIdentifier,
        apiKey: LEDGER_CONFIG.apiKey,
        loggerLevel: LEDGER_CONFIG.logLevel,
        environment: LEDGER_CONFIG.environment,
      });

      cleanupRef.current = cleanup;
      setReady(true);

      return () => {
        cleanup();
        cleanupRef.current = null;
      };
    });
  }, []);

  return { ready };
}
