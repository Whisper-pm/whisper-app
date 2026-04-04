import { NextRequest, NextResponse } from "next/server";
import { revokeAgent } from "@/lib/agent-store";

// POST /api/agents/[agentId]/revoke — Revoke an agent
// Body: { nullifier } — only the authorizing human can revoke
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  try {
    const body = await req.json();
    const { nullifier } = body;

    if (!nullifier) {
      return NextResponse.json(
        { error: "Missing nullifier — only the authorizing human can revoke" },
        { status: 400 }
      );
    }

    const result = revokeAgent(agentId, nullifier);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      agentId,
      status: "revoked",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Invalid request body", detail: error.message },
      { status: 400 }
    );
  }
}
