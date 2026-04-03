import { NextRequest, NextResponse } from "next/server";
import { fetchCuratedFeed } from "@/lib/ai-scorer";

// AI-curated market feed endpoint
// Used by frontend AND agent API (x402-protected for agents)
export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  // Check for x402 agent payment header (Agent Kit integration)
  const paymentHeader = req.headers.get("x-payment");
  const isAgent = !!paymentHeader;

  // TODO: if isAgent, verify AgentBook registration + x402 payment
  // For now, public access for both humans and agents

  const feed = await fetchCuratedFeed(Math.min(limit, 50));

  return NextResponse.json({
    markets: feed.map((item) => ({
      id: item.raw.id,
      question: item.raw.question,
      conditionId: item.raw.conditionId,
      analysis: item.analysis,
      tokens: item.raw.tokens ?? [],
      outcomePrices: item.raw.outcomePrices,
      endDate: item.raw.endDate,
    })),
    source: isAgent ? "agent-api" : "web",
    count: feed.length,
  });
}
