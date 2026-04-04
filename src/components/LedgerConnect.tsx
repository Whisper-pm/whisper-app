"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Standalone Ledger connect button.
 * Initializes the Ledger Button provider, then on click calls
 * eth_requestAccounts which opens the Bluetooth/USB modal.
 */
export function LedgerConnect() {
  const [provider, setProvider] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || initRef.current) return;
    initRef.current = true;

    // Listen for the Ledger provider announcement
    const handleAnnounce = (e: any) => {
      const detail = e.detail;
      if (detail?.info?.name?.toLowerCase().includes("ledger")) {
        setProvider(detail.provider);
      }
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounce as EventListener);

    // Initialize Ledger Button — it will announce itself as EIP-6963 provider
    import("@ledgerhq/ledger-wallet-provider").then((module) => {
      module.initializeLedgerProvider({
        target: document.body,
        floatingButtonPosition: "bottom-right",
        dAppIdentifier: "ledger",
        apiKey: "1e55ba3959f4543af24809d9066a2120bd2ac9246e626e26a1ff77eb109ca0e5",
        loggerLevel: "info",
        environment: "production",
        walletTransactionFeatures: ["send", "receive", "swap", "buy", "earn", "sell"],
      });

      // Request providers to trigger announcements
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    });

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleAnnounce as EventListener);
    };
  }, []);

  async function handleClick() {
    if (!provider) {
      // Provider not ready yet, request again
      window.dispatchEvent(new Event("eip6963:requestProvider"));
      setTimeout(() => {
        if (!provider) {
          console.log("[Ledger] Provider not found yet, retrying...");
        }
      }, 1000);
      return;
    }

    try {
      // This opens the Bluetooth/USB connection modal
      const accounts = await provider.request({
        method: "eth_requestAccounts",
        params: [],
      });
      if (Array.isArray(accounts) && accounts[0]) {
        setAddress(accounts[0]);
        setConnected(true);
      }
    } catch (err: any) {
      console.error("[Ledger] Connection failed:", err);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition cursor-pointer ${
        connected
          ? "bg-green-900/30 border border-green-500/30 text-green-400"
          : "bg-gray-800 border border-gray-700 text-white hover:bg-gray-700 hover:border-gray-600"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="4" y="1" width="8" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="8" cy="8.5" r="1.5" fill="currentColor"/>
      </svg>
      {connected ? `${address?.slice(0, 6)}...${address?.slice(-4)}` : "Ledger"}
    </button>
  );
}
