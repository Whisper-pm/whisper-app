import { NextRequest, NextResponse } from "next/server";

// GET /api/sentiment — returns sybil-resistant human consensus data
// Optional ?conditionId= to get sentiment for a specific market
export async function GET(req: NextRequest) {
  // Dynamic import to keep the store reference alive
  const store = await import("@/lib/store");

  const conditionId = req.nextUrl.searchParams.get("conditionId");

  if (conditionId) {
    const sentiment = store.getMarketSentiment(conditionId);
    return NextResponse.json({ sentiment });
  }

  // Return sentiment for all markets that have bets
  const sentiments = store.getAllMarketSentiments();

  // Build a map keyed by conditionId for easy client-side lookup
  const sentimentMap: Record<string, (typeof sentiments)[0]> = {};
  for (const s of sentiments) {
    sentimentMap[s.conditionId] = s;
  }

  return NextResponse.json({
    sentiments: sentimentMap,
    totalMarkets: sentiments.length,
  });
}
