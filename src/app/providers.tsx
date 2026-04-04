"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { useState, useEffect, type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { baseSepolia } from "@reown/appkit/networks";
import { wagmiAdapter, projectId } from "@/lib/wagmi";

// Initialize Reown AppKit
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [baseSepolia],
  metadata: {
    name: "Whisper",
    description: "Private Prediction Markets",
    url: typeof window !== "undefined" ? window.location.origin : "https://whisper.pm",
    icons: ["/Whisper.svg"],
  },
  themeMode: "dark",
  featuredWalletIds: [
    "19177a98252e07ddfc9af2083ba8e07ef627cb6103467ffebb3f8f4205fd7927", // Ledger Live — first in list
  ],
  features: {
    analytics: false,
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Initialize Ledger Wallet Provider (EIP-6963 compatible — like 1inch)
  // This injects a Ledger provider that wagmi auto-discovers alongside MetaMask etc.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { initializeLedgerProvider } = await import("@ledgerhq/ledger-wallet-provider");
        cleanup = initializeLedgerProvider({
          target: document.body,
          dAppIdentifier: "ledger",
          apiKey: "1e55ba3959f4543af24809d9066a2120bd2ac9246e626e26a1ff77eb109ca0e5",
          floatingButtonPosition: "bottom-right",
          loggerLevel: "debug",
          devConfig: {
            stub: {
              dAppConfig: true,
            },
          },
        });
        console.log("[Ledger] Wallet Provider initialized (EIP-6963)");
      } catch (e) {
        console.warn("[Ledger] Wallet Provider not available:", e);
      }
    })();
    return () => cleanup?.();
  }, []);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
