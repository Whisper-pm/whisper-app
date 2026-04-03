import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";

// World ID verification endpoint
// Frontend sends proof → we verify with World API → return nullifier
export async function POST(req: NextRequest) {
  const body = await req.json();

  // In staging/dev mode: accept proof directly
  if (CONFIG.worldId.appId.includes("staging")) {
    return NextResponse.json({
      success: true,
      nullifier: body.nullifier_hash ?? "staging-nullifier-" + Date.now(),
    });
  }

  // Production: verify with World ID cloud API
  const verifyRes = await fetch(`${CONFIG.worldId.verifyUrl}/${CONFIG.worldId.appId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!verifyRes.ok) {
    const error = await verifyRes.text();
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  const data = await verifyRes.json();
  return NextResponse.json({
    success: true,
    nullifier: data.nullifier,
  });
}
