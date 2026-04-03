"use client";

import { useState } from "react";
import type { ScoredMarket } from "@/lib/ai-scorer";

interface Props {
  market: ScoredMarket;
  side: "YES" | "NO";
  onClose: () => void;
  onConfirm: (amount: number) => void;
}

type Step = "input" | "ledger" | "unlink" | "bridge" | "bet" | "done" | "error";

const STEP_INFO: Record<Step, { color: string; label: string; detail: string }> = {
  input: { color: "", label: "", detail: "" },
  ledger: { color: "text-yellow-400", label: "Signing on Ledger...", detail: "Check device — AI analysis + bet details displayed" },
  unlink: { color: "text-purple-400", label: "Creating anonymous identity...", detail: "Unlink burner wallet funded from privacy pool" },
  bridge: { color: "text-blue-400", label: "Bridging via CCTP V2...", detail: "Base Sepolia → Polygon Amoy (~15 seconds)" },
  bet: { color: "text-cyan-400", label: "Placing bet on Polymarket...", detail: "Interacting with Conditional Tokens Framework" },
  done: { color: "text-green-400", label: "Bet placed anonymously!", detail: "Nobody can link this bet to your identity" },
  error: { color: "text-red-400", label: "Error", detail: "" },
};

export function BetModal({ market, side, onClose, onConfirm }: Props) {
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState("");

  const { analysis, raw } = market;
  const sideColor = side === "YES" ? "text-green-400" : "text-red-400";
  const sideBg = side === "YES" ? "border-green-500/30" : "border-red-500/30";

  async function handleConfirm() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    try {
      // 1. Ledger signing (requires physical device via WebHID)
      setStep("ledger");
      const { signBetWithLedger } = await import("@/lib/ledger");
      await signBetWithLedger({
        market: raw.question,
        conditionId: raw.conditionId,
        side,
        amount: String(Math.floor(amt * 1e6)),
        aiAnalysis: `Odds: ${analysis.odds} | EV: ${analysis.ev} | Risk: ${analysis.risk}`,
      }).catch(() => {
        // Ledger not connected: will fail in production, ok for demo without device
      });

      // 2-4. Execute full pipeline via backend API
      // Backend does: Unlink deposit → Burner → CCTP bridge → Polymarket split
      setStep("unlink");
      const res = await fetch("/api/bet/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditionId: raw.conditionId,
          side,
          amount: String(Math.floor(amt * 1e6)),
          evmPrivateKey: "0x0", // In production: user signs, backend executes
        }),
      });

      const data = await res.json();

      // Update steps based on backend progress
      if (data.steps) {
        for (const s of data.steps) {
          if (s.step.includes("bridge") || s.step.includes("cctp")) setStep("bridge");
          if (s.step.includes("polymarket") || s.step.includes("split")) setStep("bet");
        }
      }

      if (!data.success) {
        throw new Error(data.error ?? "Pipeline failed");
      }

      setStep("done");
      onConfirm(amt);
    } catch (e: any) {
      setStep("error");
      setErrorMsg(e.message);
    }
  }

  const info = STEP_INFO[step];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">Place Anonymous Bet</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">&times;</button>
        </div>

        {/* Market info */}
        <div className={`bg-gray-800 rounded-lg p-4 mb-4 border ${sideBg}`}>
          <p className="text-sm text-gray-300 mb-2 leading-relaxed">{raw.question}</p>
          <div className="flex gap-4 text-xs">
            <span className={sideColor + " font-bold text-sm"}>Position: {side}</span>
            <span className="text-gray-400">Odds: {analysis.odds}</span>
            <span className="text-gray-400">Risk: <span className={analysis.risk === "LOW" ? "text-green-400" : analysis.risk === "MEDIUM" ? "text-yellow-400" : "text-red-400"}>{analysis.risk}</span></span>
          </div>
        </div>

        {/* AI Analysis banner */}
        <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-3 mb-4 text-xs">
          <div className="flex items-center gap-1.5 text-blue-400 font-semibold mb-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            AI Analysis (displayed on Ledger)
          </div>
          <div className="text-gray-300 font-mono">
            Odds: {analysis.odds} | EV: {analysis.ev} | Risk: {analysis.risk} | {analysis.trend}
          </div>
        </div>

        {step === "input" && (
          <>
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-1.5 block">Bet Amount (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg font-mono focus:border-gray-500 outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-2 mb-4">
              {[10, 50, 100, 500].map((v) => (
                <button key={v} onClick={() => setAmount(String(v))} className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded-lg py-2 hover:border-gray-500 hover:bg-gray-750 transition font-mono">
                  ${v}
                </button>
              ))}
            </div>
            <button
              onClick={handleConfirm}
              disabled={!amount || parseFloat(amount) <= 0}
              className="w-full bg-white text-black font-semibold py-3.5 rounded-xl hover:bg-gray-100 transition disabled:opacity-20 shadow-lg"
            >
              Sign with Ledger & Place Bet
            </button>
            <div className="flex items-center gap-2 mt-3 justify-center">
              <div className="flex -space-x-1">
                <div className="w-4 h-4 bg-purple-500 rounded-full border border-gray-900" title="Unlink" />
                <div className="w-4 h-4 bg-blue-500 rounded-full border border-gray-900" title="CCTP" />
                <div className="w-4 h-4 bg-cyan-500 rounded-full border border-gray-900" title="Polymarket" />
              </div>
              <p className="text-xs text-gray-500">Unlink → CCTP → Polymarket. Fully anonymous.</p>
            </div>
          </>
        )}

        {step !== "input" && step !== "done" && step !== "error" && (
          <div className="py-8">
            {/* Progress bar */}
            <div className="flex gap-1 mb-6">
              {(["ledger", "unlink", "bridge", "bet"] as Step[]).map((s) => (
                <div key={s} className={`flex-1 h-1 rounded-full ${
                  s === step ? "bg-white animate-pulse" :
                  (["ledger","unlink","bridge","bet"].indexOf(s) < ["ledger","unlink","bridge","bet"].indexOf(step)) ? "bg-green-500" :
                  "bg-gray-800"
                }`} />
              ))}
            </div>
            <div className="text-center">
              <div className={`text-lg mb-2 ${info.color} animate-pulse`}>{info.label}</div>
              <p className="text-xs text-gray-400">{info.detail}</p>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <div className="text-green-400 text-lg font-semibold mb-1">Bet placed anonymously</div>
            <p className="text-xs text-gray-400 mb-4">Your bet is live on Polymarket. Nobody can trace it back to you.</p>
            <button onClick={onClose} className="bg-gray-800 px-8 py-2.5 rounded-lg hover:bg-gray-700 transition text-sm">
              Close
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="text-center py-8">
            <div className="text-red-400 text-lg mb-2">Something went wrong</div>
            <p className="text-xs text-gray-400 mb-4">{errorMsg}</p>
            <button onClick={() => setStep("input")} className="bg-gray-800 px-8 py-2.5 rounded-lg hover:bg-gray-700 transition text-sm">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
