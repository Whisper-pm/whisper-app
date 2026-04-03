"use client";

import { useState } from "react";

interface Props {
  poolBalance: string;
  onChainBalance: string;
  onDeposit: (amount: number) => Promise<void>;
  onWithdraw: (amount: number) => Promise<void>;
}

export function DepositPanel({ poolBalance, onChainBalance, onDeposit, onWithdraw }: Props) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleAction() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setStatus(mode === "deposit" ? "Depositing to privacy pool..." : "Withdrawing...");
    try {
      if (mode === "deposit") await onDeposit(amt);
      else await onWithdraw(amt);
      setStatus("Done!");
      setAmount("");
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Privacy Pool</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("deposit")}
            className={`text-xs px-3 py-1 rounded ${mode === "deposit" ? "bg-green-600/30 text-green-400" : "bg-gray-800 text-gray-500"}`}
          >
            Deposit
          </button>
          <button
            onClick={() => setMode("withdraw")}
            className={`text-xs px-3 py-1 rounded ${mode === "withdraw" ? "bg-red-600/30 text-red-400" : "bg-gray-800 text-gray-500"}`}
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
        <div className="bg-gray-800 rounded-lg p-2">
          <div className="text-gray-500">Shielded (Pool)</div>
          <div className="text-white font-mono font-bold">{poolBalance} USDC</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-2">
          <div className="text-gray-500">Wallet (Public)</div>
          <div className="text-white font-mono font-bold">{onChainBalance} USDC</div>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount USDC"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        />
        <button
          onClick={handleAction}
          disabled={loading || !amount}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-30 ${
            mode === "deposit"
              ? "bg-green-600/30 text-green-400 hover:bg-green-600/40"
              : "bg-red-600/30 text-red-400 hover:bg-red-600/40"
          }`}
        >
          {loading ? "..." : mode === "deposit" ? "Shield" : "Unshield"}
        </button>
      </div>
      {status && <p className="text-xs text-gray-400 mt-2">{status}</p>}
    </div>
  );
}
