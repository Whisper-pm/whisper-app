import { NextRequest, NextResponse } from "next/server";
import { getAgentsByHuman } from "@/lib/agent-store";

// GET /api/agents/my?nullifier=... — Get agents authorized by this human
// This endpoint exposes full details including status for the owner
export async function GET(req: NextRequest) {
  const nullifier = req.nextUrl.searchParams.get("nullifier");

  if (!nullifier) {
    return NextResponse.json(
      { error: "Missing nullifier parameter" },
      { status: 400 }
    );
  }

  const agents = getAgentsByHuman(nullifier);

  return NextResponse.json({
    agents: agents.map((a) => ({
      agentId: a.agentId,
      name: a.name,
      agentWallet: a.agentWallet,
      status: a.status,
      createdAt: a.createdAt,
      limits: a.limits,
      stats: a.stats,
    })),
    count: agents.length,
  });
}
