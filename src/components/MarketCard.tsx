"use client";

import type { ScoredMarket } from "@/lib/ai-scorer";

interface Props {
  item: ScoredMarket;
  onBet: (market: ScoredMarket, side: "YES" | "NO") => void;
}

function riskColor(risk: string) {
  if (risk === "LOW") return "text-green-400";
  if (risk === "MEDIUM") return "text-yellow-400";
  return "text-red-400";
}

function scoreColor(score: number) {
  if (score >= 70) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (score >= 50) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

export function MarketCard({ item, onBet }: Props) {
  const { raw, analysis } = item;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-medium text-white leading-tight flex-1 mr-3">
          {raw.question}
        </h3>
        <span className={`text-xs font-mono px-2 py-1 rounded border ${scoreColor(analysis.score)}`}>
          {analysis.score}
        </span>
      </div>

      {/* AI Analysis */}
      <div className="grid grid-cols-4 gap-2 mb-4 text-xs">
        <div className="text-center">
          <div className="text-gray-500">Odds</div>
          <div className="text-white font-semibold">{analysis.odds}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">EV</div>
          <div className="text-white font-semibold">{analysis.ev}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">Risk</div>
          <div className={`font-semibold ${riskColor(analysis.risk)}`}>{analysis.risk}</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500">Time</div>
          <div className="text-white font-semibold">{analysis.timeLeft}</div>
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
        <span>{analysis.trend}</span>
        <span>Vol {analysis.volume}</span>
        <span>Liq {analysis.liquidity}</span>
      </div>

      {/* Bet buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onBet(item, "YES")}
          className="flex-1 bg-green-600/20 text-green-400 border border-green-600/30 rounded-lg py-2 text-sm font-semibold hover:bg-green-600/30 transition"
        >
          YES {analysis.odds}
        </button>
        <button
          onClick={() => onBet(item, "NO")}
          className="flex-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg py-2 text-sm font-semibold hover:bg-red-600/30 transition"
        >
          NO {100 - parseInt(analysis.odds)}%
        </button>
      </div>
    </div>
  );
}
