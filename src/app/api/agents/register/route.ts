import { NextRequest, NextResponse } from "next/server";
import { registerAgent } from "@/lib/agent-store";
import { getBets } from "@/lib/store";

// POST /api/agents/register — Register a new AI agent
// Body: { nullifier, agentWallet, name, limits? }
// The nullifier must belong to a World ID verified human with at least one bet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nullifier, agentWallet, name, limits } = body;

    if (!nullifier) {
      return NextResponse.json(
        { error: "Missing nullifier — human must be World ID verified" },
        { status: 400 }
      );
    }

    if (!agentWallet || !name) {
      return NextResponse.json(
        { error: "Missing required fields: agentWallet, name" },
        { status: 400 }
      );
    }

    // Verify nullifier is known (has been verified via World ID)
    // In production, check against a verified nullifier registry
    // For demo, we accept any nullifier that looks valid or has bets
    const hasActivity = getBets(nullifier).length > 0;
    const looksValid = nullifier.startsWith("0x") && nullifier.length > 10;

    if (!hasActivity && !looksValid) {
      return NextResponse.json(
        { error: "Nullifier not recognized — complete World ID verification first" },
        { status: 403 }
      );
    }

    const result = registerAgent({
      humanNullifier: nullifier,
      agentWallet,
      name,
      limits,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      agent: {
        agentId: result.agent.agentId,
        name: result.agent.name,
        agentWallet: result.agent.agentWallet,
        status: result.agent.status,
        limits: result.agent.limits,
        createdAt: result.agent.createdAt,
      },
      apiDocs: {
        trade: {
          method: "POST",
          url: "/api/agents/trade",
          headers: { "x-agent-wallet": agentWallet },
          body: {
            agentId: result.agent.agentId,
            conditionId: "string",
            side: "YES | NO",
            amount: "number (USDC)",
          },
        },
        markets: {
          method: "GET",
          url: "/api/markets",
          description: "Fetch AI-curated markets to trade",
        },
        leaderboard: {
          method: "GET",
          url: "/api/agents",
          description: "View agent leaderboard",
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Invalid request body", detail: error.message },
      { status: 400 }
    );
  }
}
