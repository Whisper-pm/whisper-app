"use client";

import { useState, useEffect, useCallback } from "react";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { WorldIdGate } from "@/components/WorldIdGate";
import { Feed } from "@/components/Feed";
import { DepositPanel } from "@/components/DepositPanel";
import { Portfolio } from "@/components/Portfolio";
import { AgentDashboard } from "@/components/AgentDashboard";

// For hackathon demo: private key is passed to server APIs
// In production: user signs in browser, backend uses session
const DEMO_PK = "0x47b0a088fc62101d8aefc501edec2266ff2fc4cf84c93a8e6c315dedb0d942be";

export default function Home() {
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [tab, setTab] = useState<"feed" | "portfolio" | "agents">("feed");
  const [agentCount, setAgentCount] = useState(0);
  const [poolBalance, setPoolBalance] = useState("...");
  const [onChainBalance, setOnChainBalance] = useState("...");
  const [bets, setBets] = useState<Array<{ id: string; market: string; side: "YES" | "NO"; amount: number; odds: string; status: "active" | "won" | "lost" | "pending"; pnl?: number }>>([]);
  const [totalPnl, setTotalPnl] = useState(0);

  // Fetch portfolio from the in-memory store
  const fetchPortfolio = useCallback(async () => {
    if (!nullifier) return;
    try {
      const res = await fetch(`/api/portfolio?nullifier=${encodeURIComponent(nullifier)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.bets && data.bets.length > 0) {
          setBets(data.bets);
          setTotalPnl(data.totalPnl ?? 0);
        }
      }
    } catch {}
  }, [nullifier]);

  // Fetch real balances from backend
  const fetchBalances = useCallback(async () => {
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evmPrivateKey: DEMO_PK }),
      });
      if (res.ok) {
        const data = await res.json();
        setPoolBalance(data.pool);
        setOnChainBalance(data.usdc);
      }
    } catch {}
  }, []);

  // Fetch agent count for tab badge
  const fetchAgentCount = useCallback(async () => {
    if (!nullifier) return;
    try {
      const res = await fetch(`/api/agents/my?nullifier=${encodeURIComponent(nullifier)}`);
      if (res.ok) {
        const data = await res.json();
        setAgentCount(data.agents?.filter((a: { status: string }) => a.status !== "revoked").length ?? 0);
      }
    } catch {}
  }, [nullifier]);

  // Load balances + portfolio + agent count when verified
  useEffect(() => {
    if (nullifier) {
      fetchBalances();
      fetchPortfolio();
      fetchAgentCount();
      const balanceInterval = setInterval(fetchBalances, 15000);
      const portfolioInterval = setInterval(fetchPortfolio, 10000);
      const agentInterval = setInterval(fetchAgentCount, 15000);
      return () => {
        clearInterval(balanceInterval);
        clearInterval(portfolioInterval);
        clearInterval(agentInterval);
      };
    }
  }, [nullifier, fetchBalances, fetchPortfolio, fetchAgentCount]);

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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">Whisper</h1>
                  <span className="text-xs bg-green-900/50 text-green-400 border border-green-500/30 px-2 py-0.5 rounded">
                    Verified Human
                  </span>
                  <span className="text-xs text-gray-600 font-mono">{nullifier?.substring(0, 16)}...</span>
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
                    Portfolio ({bets.length})
                  </button>
                  <button
                    onClick={() => setTab("agents")}
                    className={`text-sm px-4 py-1.5 rounded-lg ${tab === "agents" ? "bg-white text-black font-semibold" : "bg-gray-900 text-gray-400 hover:text-white"}`}
                  >
                    Agents ({agentCount})
                  </button>
                </div>
              </div>
              <DepositPanel
                poolBalance={poolBalance}
                onChainBalance={onChainBalance}
                onDeposit={async (amt) => {
                  const res = await fetch("/api/deposit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: String(Math.floor(amt * 1e6)), evmPrivateKey: DEMO_PK }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setPoolBalance(data.poolBalance);
                    setOnChainBalance(data.walletBalance);
                  } else {
                    throw new Error(data.error);
                  }
                }}
                onWithdraw={async (amt) => {
                  const res = await fetch("/api/withdraw", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: String(Math.floor(amt * 1e6)), evmPrivateKey: DEMO_PK }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setPoolBalance(data.poolBalance);
                    setOnChainBalance(data.walletBalance);
                  } else {
                    throw new Error(data.error);
                  }
                }}
              />
            </div>

            {tab === "feed" ? (
              <Feed nullifier={nullifier} onBetPlaced={(market, side, amount) => {
                // Optimistic local update for instant UI feedback
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
                // Then sync with server store
                fetchPortfolio();
                fetchBalances();
              }} />
            ) : tab === "portfolio" ? (
              <Portfolio bets={bets} totalPnl={totalPnl} />
            ) : (
              <AgentDashboard nullifier={nullifier} />
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
