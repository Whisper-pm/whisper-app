"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useWalletClient } from "wagmi";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { Feed } from "@/components/Feed";
import { DepositPanel } from "@/components/DepositPanel";
import { Portfolio } from "@/components/Portfolio";
import { AgentDashboard } from "@/components/AgentDashboard";
import { useWallet } from "@/lib/wallet-context";


function AppContent() {
  // Browser wallet from AppKit (Rabby, MetaMask, etc.)
  const { address: browserAddress, isConnected: isBrowserConnected } = useAppKitAccount();
  const { data: walletClient } = useWalletClient();
  // Ledger from our wallet context
  const { ledgerAddress, isLedgerConnected, connectLedger, disconnectLedger } = useWallet();

  // Active address: Ledger takes priority
  const address = ledgerAddress || browserAddress || null;
  const isConnected = isLedgerConnected || isBrowserConnected;
  const [tab, setTab] = useState<"feed" | "portfolio" | "agents">("feed");
  const [agentCount, setAgentCount] = useState(0);
  const [poolBalance, setPoolBalance] = useState("—");
  const [onChainBalance, setOnChainBalance] = useState("—");
  const [bets, setBets] = useState<Array<{ id: string; market: string; side: "YES" | "NO"; amount: number; odds: string; status: "active" | "won" | "lost" | "pending"; pnl?: number }>>([]);
  const [totalPnl, setTotalPnl] = useState(0);

  // Fetch portfolio
  const fetchPortfolio = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/portfolio?address=${encodeURIComponent(address)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.bets && data.bets.length > 0) {
          setBets(data.bets);
          setTotalPnl(data.totalPnl ?? 0);
        }
      }
    } catch {}
  }, [address]);

  // Fetch balances — only if wallet is connected
  const fetchBalances = useCallback(async () => {
    if (!isConnected || !address) return;
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evmAddress: address }),
      });
      if (res.ok) {
        const data = await res.json();
        setPoolBalance(data.pool ?? "0.00");
        setOnChainBalance(data.usdc ?? "0.00");
      } else {
        // API failed — show 0 instead of dash
        setPoolBalance("0.00");
        setOnChainBalance("0.00");
      }
    } catch {
      setPoolBalance("0.00");
      setOnChainBalance("0.00");
    }
  }, [isConnected, address]);

  // Fetch agent count
  const fetchAgentCount = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/agents/my?address=${encodeURIComponent(address)}`);
      if (res.ok) {
        const data = await res.json();
        setAgentCount(data.agents?.filter((a: { status: string }) => a.status !== "revoked").length ?? 0);
      }
    } catch {}
  }, [address]);

  // Load data when connected
  useEffect(() => {
    if (isConnected && address) {
      fetchPortfolio();
      fetchAgentCount();
      fetchBalances();
      const portfolioInterval = setInterval(fetchPortfolio, 10000);
      const agentInterval = setInterval(fetchAgentCount, 15000);
      const balanceInterval = setInterval(fetchBalances, 15000);
      return () => { clearInterval(portfolioInterval); clearInterval(agentInterval); clearInterval(balanceInterval); };
    }
  }, [isConnected, address, fetchPortfolio, fetchAgentCount, fetchBalances]);

  return (
    <>
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold">Whisper</h1>
                  {isConnected && address && (
                    <>
                      <span className="text-xs bg-green-900/50 text-green-400 border border-green-500/30 px-2 py-0.5 rounded">Connected</span>
                      <span className="text-xs text-gray-600 font-mono">{address.substring(0, 10)}...{address.slice(-4)}</span>
                    </>
                  )}
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
                poolBalance={isConnected ? poolBalance : "Connect wallet"}
                onChainBalance={isConnected ? onChainBalance : "Connect wallet"}
                onDeposit={async (amt) => {
                  if (!isConnected || !address) throw new Error("Connect wallet first");
                  const amount = String(Math.floor(amt * 1e6));

                  // Step 0: Ensure USDC is approved to Permit2
                  const approveRes = await fetch("/api/deposit/approve", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ evmAddress: address }),
                  });
                  const approveData = await approveRes.json();
                  if (approveData.status === "needs_approval") {
                    // User needs to approve USDC → Permit2 on-chain
                    if (isLedgerConnected) {
                      // Sign approve tx with Ledger
                      const { sendLedgerTransaction } = await import("@/lib/ledger");
                      await sendLedgerTransaction(approveData.txData);
                    } else if (walletClient) {
                      await walletClient.sendTransaction({
                        account: walletClient.account!,
                        to: approveData.txData.to as `0x${string}`,
                        data: approveData.txData.data as `0x${string}`,
                      });
                    }
                    // Wait for approval to confirm
                    await new Promise((r) => setTimeout(r, 5000));
                    console.log("[Deposit] Permit2 approval sent");
                  }

                  // Step 1: Prepare on server
                  const prepRes = await fetch("/api/deposit/prepare", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount, evmAddress: address }),
                  });
                  const prep = await prepRes.json();
                  if (!prep.txId) throw new Error(prep.error || "Prepare failed");

                  // Step 2: Sign — Ledger or browser wallet
                  let signature: string;
                  if (isLedgerConnected) {
                    const { signTypedDataOnLedger } = await import("@/lib/ledger");
                    signature = await signTypedDataOnLedger("44'/60'/0'/0/0", prep.typedData);
                  } else if (walletClient) {
                    try {
                      signature = await walletClient.signTypedData({
                        account: walletClient.account!,
                        domain: prep.typedData.domain,
                        types: prep.typedData.types,
                        primaryType: prep.typedData.primaryType,
                        message: prep.typedData.message,
                      });
                    } catch (signErr: any) {
                      throw new Error("Signature rejected: " + (signErr.shortMessage || signErr.message));
                    }
                  } else {
                    throw new Error("No wallet connected");
                  }

                  // Step 3: Submit signature to server
                  const submitRes = await fetch("/api/deposit/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ txId: prep.txId, signature, nonce: prep.nonce, deadline: prep.deadline }),
                  });
                  const submit = await submitRes.json();
                  if (!submit.success) throw new Error(submit.error || "Submit failed");

                  await new Promise((r) => setTimeout(r, 5000));
                  fetchBalances();
                }}
                onWithdraw={async (amt) => {
                  if (!isConnected) throw new Error("Connect wallet first");
                  const res = await fetch("/api/withdraw", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: String(Math.floor(amt * 1e6)), evmAddress: address }),
                  });
                  const data = await res.json();
                  if (!data.success) throw new Error(data.error);
                  fetchBalances();
                }}
              />
            </div>

            {tab === "feed" ? (
              <Feed userAddress={address} onBetPlaced={(market, side, amount) => {
                setBets((prev) => [
                  ...prev,
                  { id: "bet-" + Date.now(), market: market.substring(0, 60), side, amount, odds: "50%", status: "active" as const },
                ]);
                fetchPortfolio();
                fetchBalances();
              }} />
            ) : tab === "portfolio" ? (
              <Portfolio bets={bets} totalPnl={totalPnl} />
            ) : (
              <AgentDashboard userAddress={address ?? ""} />
            )}
          </>
      </main>
      <footer className="border-t border-gray-800 px-6 py-4 text-center text-xs text-gray-600">
        Whisper &mdash; Privacy by Unlink | Signed by Ledger | AI-Curated Feed
      </footer>
    </>
  );
}

export default function Home() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}
