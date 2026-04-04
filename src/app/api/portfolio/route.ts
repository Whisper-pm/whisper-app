import { NextRequest, NextResponse } from "next/server";
import { getUserPortfolio } from "@/lib/store";

// Get user's portfolio (bets, P&L)
// Keyed by World ID nullifier (anonymous identity)
export async function GET(req: NextRequest) {
  const nullifier = req.nextUrl.searchParams.get("nullifier");

  if (!nullifier) {
    return NextResponse.json({ error: "Missing nullifier parameter" }, { status: 400 });
  }

  const portfolio = getUserPortfolio(nullifier);

  return NextResponse.json({
    nullifier: portfolio.nullifier,
    bets: portfolio.bets,
    totalPnl: portfolio.totalPnl,
  });
}
