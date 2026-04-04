import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  validateAgentTrade,
  updateAgentStats,
} from "@/lib/agent-store";
import { addBet } from "@/lib/store";

// POST /api/agents/trade — Agent places a trade
// Body: { agentId, conditionId, side, amount, agentSignature? }
// Header: x-agent-wallet: 0x...
export async function POST(req: NextRequest) {
  try {
    const agentWallet = req.headers.get("x-agent-wallet");
    const body = await req.json();
    const { agentId, conditionId, side, amount } = body;

    // Validate required fields
    if (!agentId || !conditionId || !side || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: agentId, conditionId, side, amount" },
        { status: 400 }
      );
    }

    if (side !== "YES" && side !== "NO") {
      return NextResponse.json(
        { error: "Side must be 'YES' or 'NO'" },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number (USDC)" },
        { status: 400 }
      );
    }

    // Get agent and verify wallet matches
    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agentWallet && agentWallet.toLowerCase() !== agent.agentWallet) {
      return NextResponse.json(
        { error: "x-agent-wallet header does not match registered agent wallet" },
        { status: 403 }
      );
    }

    // Validate trade against agent limits
    const validationError = validateAgentTrade(agentId, conditionId, numAmount);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 403 });
    }

    // Record the bet in the main store (attributed to the agent's human)
    const bet = addBet(agent.humanNullifier, {
      market: `[Agent: ${agent.name}] ${conditionId}`,
      conditionId,
      side: side as "YES" | "NO",
      amount: numAmount,
      odds: "50%",
      status: "active",
    });

    // Simulate random outcome for demo: ~55% chance the agent is right
    const won = Math.random() < 0.55;
    const pnl = won ? numAmount * 0.85 : -numAmount;

    // Update agent stats
    updateAgentStats(agentId, {
      betAmount: numAmount,
      won,
      pnl,
    });

    return NextResponse.json({
      success: true,
      trade: {
        betId: bet.id,
        agentId: agent.agentId,
        agentName: agent.name,
        conditionId,
        side,
        amount: numAmount,
        status: "active",
      },
      agent: {
        wallet: agent.agentWallet,
        humanBacked: true,
        remainingDailyVolume: agent.limits.maxDailyVolume - agent.stats.todayVolume,
      },
      pipeline: "Unlink -> CCTP (Base->Polygon) -> Polymarket CTF",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Invalid request body", detail: error.message },
      { status: 400 }
    );
  }
}
