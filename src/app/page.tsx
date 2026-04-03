"use client";

import { useState } from "react";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { WorldIdGate } from "@/components/WorldIdGate";
import { Feed } from "@/components/Feed";
import { DepositPanel } from "@/components/DepositPanel";
import { Portfolio } from "@/components/Portfolio";

export default function Home() {
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [tab, setTab] = useState<"feed" | "portfolio">("feed");

  const [poolBalance, setPoolBalance] = useState("0.00");
  const [onChainBalance, setOnChainBalance] = useState("0.00");
  const [bets, setBets] = useState<Array<{ id: string; market: string; side: "YES" | "NO"; amount: number; odds: string; status: "active" | "won" | "lost" | "pending"; pnl?: number }>>([]);

  // Fetch balances on load (demo values, real in production)
  useState(() => {
    fetch("/api/markets?limit=1").then(() => {
      setPoolBalance("0.67");
      setOnChainBalance("3458.25");
    }).catch(() => {});
  });

  return (
    <Providers>
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {!nullifier ? (
          <WorldIdGate onVerified={setNullifier}>
            <Feed />
          </WorldIdGate>
        ) : (
          <>
            {/* Top bar: deposit + tabs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">Whisper</h1>
                  <span className="text-xs bg-green-900/50 text-green-400 border border-green-500/30 px-2 py-0.5 rounded">
                    Verified Human
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  AI-curated predictions. Private bets. Hardware-signed.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setTab("feed")}
                    className={`text-sm px-4 py-1.5 rounded-lg ${tab === "feed" ? "bg-white text-black font-semibold" : "bg-gray-900 text-gray-400 hover:text-white"}`}
                  >
                    AI Feed
                  </button>
                  <button
                    onClick={() => setTab("portfolio")}
                    className={`text-sm px-4 py-1.5 rounded-lg ${tab === "portfolio" ? "bg-white text-black font-semibold" : "bg-gray-900 text-gray-400 hover:text-white"}`}
                  >
                    Portfolio
                  </button>
                </div>
              </div>
              <DepositPanel
                poolBalance={poolBalance}
                onChainBalance={onChainBalance}
                onDeposit={async (amt) => {
                  // In production: call depositToPool from unlink-client
                  console.log("Deposit", amt, "USDC to privacy pool");
                  setPoolBalance((prev) => (parseFloat(prev) + amt).toFixed(2));
                  setOnChainBalance((prev) => (parseFloat(prev) - amt).toFixed(2));
                }}
                onWithdraw={async (amt) => {
                  // In production: call withdrawFromPool from unlink-client
                  console.log("Withdraw", amt, "USDC from privacy pool");
                  setPoolBalance((prev) => (parseFloat(prev) - amt).toFixed(2));
                  setOnChainBalance((prev) => (parseFloat(prev) + amt).toFixed(2));
                }}
              />
            </div>

            {/* Content */}
            {tab === "feed" ? (
              <Feed onBetPlaced={(market, side, amount) => {
                setBets((prev) => [
                  ...prev,
                  {
                    id: "bet-" + Date.now(),
                    market: market.substring(0, 60),
                    side,
                    amount,
                    odds: "50%",
                    status: "active" as const,
                  },
                ]);
                setPoolBalance((prev) => (parseFloat(prev) - amount).toFixed(2));
              }} />
            ) : (
              <Portfolio bets={bets} totalPnl={bets.reduce((acc, b) => acc + (b.pnl ?? 0), 0)} />
            )}
          </>
        )}
      </main>
      <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600">
        Whisper &mdash; Privacy by Unlink | Identity by World ID | Signed by Ledger | AI-Curated Feed
      </footer>
    </Providers>
  );
}
