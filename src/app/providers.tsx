"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type Config } from "wagmi";
import { useState, type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { baseSepolia } from "@reown/appkit/networks";
import { wagmiAdapter, projectId } from "@/lib/wagmi";
import { WalletProvider } from "@/lib/wallet-context";

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

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
