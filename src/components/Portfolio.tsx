"use client";

interface Bet {
  id: string;
  market: string;
  side: "YES" | "NO";
  amount: number;
  odds: string;
  status: "active" | "won" | "lost" | "pending";
  pnl?: number;
}

interface Props {
  bets: Bet[];
  totalPnl: number;
}

export function Portfolio({ bets, totalPnl }: Props) {
  if (bets.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
        No bets yet. Browse the AI feed and place your first anonymous bet.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold">Your Positions</h3>
        <span className={`text-sm font-mono font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
          {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} USDC
        </span>
      </div>
      <div className="divide-y divide-gray-800">
        {bets.map((bet) => (
          <div key={bet.id} className="px-4 py-3 flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              bet.side === "YES" ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"
            }`}>
              {bet.side}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{bet.market}</p>
              <p className="text-xs text-gray-500">{bet.amount} USDC @ {bet.odds}</p>
            </div>
            <div className="text-right">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                bet.status === "won" ? "bg-green-900/50 text-green-400" :
                bet.status === "lost" ? "bg-red-900/50 text-red-400" :
                bet.status === "active" ? "bg-blue-900/50 text-blue-400" :
                "bg-gray-800 text-gray-400"
              }`}>
                {bet.status}
              </span>
              {bet.pnl !== undefined && (
                <p className={`text-xs mt-1 ${bet.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {bet.pnl >= 0 ? "+" : ""}{bet.pnl.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
