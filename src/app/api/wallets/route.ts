import { NextRequest, NextResponse } from "next/server";
import { getAllBurners, getBurnersByParent } from "@/lib/wallet-store";

export async function GET(req: NextRequest) {
  const parent = req.nextUrl.searchParams.get("parent");

  if (parent) {
    const burners = getBurnersByParent(parent);
    return NextResponse.json({ parent, burners, count: burners.length });
  }

  const all = getAllBurners();
  return NextResponse.json({ burners: all, count: all.length });
}
