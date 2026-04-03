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

  // Demo balances — in production: fetch from Unlink SDK
  const [poolBalance] = useState("0.67");
  const [onChainBalance] = useState("3458.25");
  const [bets] = useState([
    { id: "1", market: "Will ETH > $5K by July 2026?", side: "YES" as const, amount: 100, odds: "62%", status: "active" as const },
    { id: "2", market: "Russia-Ukraine Ceasefire before GTA VI?", side: "NO" as const, amount: 50, odds: "46%", status: "active" as const, pnl: 12.5 },
  ]);

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
                onDeposit={async (amt) => { console.log("Deposit", amt); }}
                onWithdraw={async (amt) => { console.log("Withdraw", amt); }}
              />
            </div>

            {/* Content */}
            {tab === "feed" ? (
              <Feed />
            ) : (
              <Portfolio bets={bets} totalPnl={12.5} />
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
