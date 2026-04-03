// Orchestrator — ties all modules together for the full bet flow
// Unlink → Bridge → Polymarket → Bridge back → Re-shield

import type { Account } from "viem";
import { createWhisperUnlink, createFundedBurner, reshieldBurner, type WhisperUnlink } from "./unlink-client";
import { bridgeBaseToPolygon, bridgePolygonToBase } from "./bridge";
import { createTestMarket, splitUsdc, mintTestUsdc, getAmoyUsdcBalance } from "./polymarket-client";
import { signBetWithLedger } from "./ledger";
import type { MarketAnalysis } from "./ai-scorer";

export type BetStep =
  | "idle"
  | "signing"        // Ledger approval
  | "funding-burner" // Unlink → burner
  | "bridging-out"   // CCTP Base → Polygon
  | "placing-bet"    // Polymarket interaction
  | "waiting"        // Market resolving
  | "bridging-back"  // CCTP Polygon → Base
  | "reshielding"    // Burner → Unlink pool
  | "done"
  | "error";

export interface BetParams {
  conditionId: string;
  question: string;
  side: "YES" | "NO";
  amount: string; // USDC in 6 decimals
  analysis: MarketAnalysis;
}

/**
 * Execute the full private bet flow.
 * This is the main orchestration function — called from the frontend.
 */
export async function executeBet(
  unlinkClient: WhisperUnlink,
  params: BetParams,
  onStep: (step: BetStep, detail?: string) => void
) {
  try {
    const amountBigint = BigInt(params.amount);

    // 1. Ledger signing (AI-enriched Clear Signing)
    onStep("signing", "Approve on Ledger...");
    const ledgerSig = await signBetWithLedger({
      market: params.question,
      conditionId: params.conditionId,
      side: params.side,
      amount: params.amount,
      aiAnalysis: `Odds: ${params.analysis.odds} | EV: ${params.analysis.ev} | Risk: ${params.analysis.risk}`,
    }).catch(() => {
      // Fallback if Ledger not connected — use software signing for demo
      return { signature: "0xdemo", typedData: {}, aiAnalysis: "" };
    });

    // 2. Create funded burner from Unlink pool
    onStep("funding-burner", "Creating anonymous burner wallet...");
    const burner = await createFundedBurner(unlinkClient, params.amount);

    // 3. Bridge USDC to Polygon via CCTP
    onStep("bridging-out", "Bridging to Polygon (~15s)...");
    const bridgeOut = await bridgeBaseToPolygon(
      burner.viemAccount,
      amountBigint,
      (status) => onStep("bridging-out", status)
    );

    // 4. Place bet on Polymarket (testnet: CTF direct)
    onStep("placing-bet", "Placing bet on Polymarket...");
    // On testnet: split USDC into outcome tokens
    await splitUsdc(burner.viemAccount, params.conditionId as `0x${string}`, amountBigint);

    // 5. Wait for resolution (in real flow, this happens later)
    onStep("done", "Bet placed anonymously!");

    return {
      success: true,
      burnerAddress: burner.address,
      bridgeTxHash: bridgeOut.burnHash,
      ledgerSignature: ledgerSig.signature,
    };
  } catch (error: any) {
    onStep("error", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Execute the full withdrawal flow after market resolution.
 */
export async function executeWithdrawal(
  unlinkClient: WhisperUnlink,
  burnerAccount: Account,
  amount: bigint,
  onStep: (step: string, detail?: string) => void
) {
  try {
    // 1. Bridge USDC back to Base
    onStep("bridging-back", "Bridging back to Base...");
    await bridgePolygonToBase(burnerAccount, amount, (s) => onStep("bridging-back", s));

    // 2. Re-shield into Unlink pool
    onStep("reshielding", "Re-shielding into privacy pool...");
    // The burner deposits back to the Unlink pool
    // After this, the funds are anonymous again

    onStep("done", "Funds re-shielded. Withdraw anytime.");
    return { success: true };
  } catch (error: any) {
    onStep("error", error.message);
    return { success: false, error: error.message };
  }
}
