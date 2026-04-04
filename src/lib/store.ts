// Whisper — Bet store with JSON file persistence
// Persists to data/bets.json for durability across restarts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const STORE_PATH = join(process.cwd(), "data", "bets.json");

export interface Bet {
  id: string;
  market: string;
  conditionId: string;
  side: "YES" | "NO";
  amount: number; // in USDC (human-readable, e.g. 50)
  odds: string;
  status: "pending" | "active" | "won" | "lost";
  pnl?: number;
  burner?: string;
  txHash?: string;
  createdAt: number; // unix ms
}

export interface UserPortfolio {
  nullifier: string;
  bets: Bet[];
  totalPnl: number;
}

export interface MarketSentiment {
  conditionId: string;
  yesCount: number;
  noCount: number;
  totalHumans: number;
  yesPercent: number;
}

// ---------- JSON Persistence ----------

interface StoreData {
  [nullifier: string]: { bets: Bet[] };
}

function loadStore(): Map<string, { bets: Bet[] }> {
  if (!existsSync(STORE_PATH)) return new Map();
  try {
    const raw: StoreData = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
    const map = new Map<string, { bets: Bet[] }>();
    for (const [key, value] of Object.entries(raw)) {
      map.set(key, value);
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveStore() {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const obj: StoreData = {};
  for (const [key, value] of store.entries()) {
    obj[key] = value;
  }
  writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
}

// Global store: nullifier -> portfolio data (loaded from disk)
const store = loadStore();

function ensureUser(nullifier: string) {
  if (!store.has(nullifier)) {
    store.set(nullifier, { bets: [] });
  }
  return store.get(nullifier)!;
}

export function addBet(nullifier: string, bet: Omit<Bet, "id" | "createdAt">): Bet {
  const user = ensureUser(nullifier);
  const fullBet: Bet = {
    ...bet,
    id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  user.bets.push(fullBet);
  saveStore();
  return fullBet;
}

export function getBets(nullifier: string): Bet[] {
  return ensureUser(nullifier).bets;
}

export function updateBetStatus(
  nullifier: string,
  betId: string,
  status: Bet["status"],
  pnl?: number
): Bet | null {
  const user = ensureUser(nullifier);
  const bet = user.bets.find((b) => b.id === betId);
  if (!bet) return null;
  bet.status = status;
  if (pnl !== undefined) bet.pnl = pnl;
  saveStore();
  return bet;
}

export function getUserPortfolio(nullifier: string): UserPortfolio {
  const user = ensureUser(nullifier);
  const totalPnl = user.bets.reduce((acc, b) => acc + (b.pnl ?? 0), 0);
  return {
    nullifier,
    bets: user.bets,
    totalPnl,
  };
}

// ---------- Sentiment: Sybil-Resistant Collective Intelligence ----------

/**
 * Get verified human consensus for a specific market.
 * Counts unique nullifiers (not bets) to be truly sybil-resistant.
 */
export function getMarketSentiment(conditionId: string): MarketSentiment {
  const yesNullifiers = new Set<string>();
  const noNullifiers = new Set<string>();

  for (const [nullifier, data] of store.entries()) {
    for (const bet of data.bets) {
      if (bet.conditionId === conditionId) {
        // Only count the user's LATEST bet on this market
        if (bet.side === "YES") {
          yesNullifiers.add(nullifier);
          noNullifiers.delete(nullifier);
        } else {
          noNullifiers.add(nullifier);
          yesNullifiers.delete(nullifier);
        }
      }
    }
  }

  const yesCount = yesNullifiers.size;
  const noCount = noNullifiers.size;
  const totalHumans = yesCount + noCount;
  const yesPercent = totalHumans > 0 ? Math.round((yesCount / totalHumans) * 100) : 0;

  return { conditionId, yesCount, noCount, totalHumans, yesPercent };
}

/**
 * Get sentiment for ALL markets that have at least one bet.
 */
export function getAllMarketSentiments(): MarketSentiment[] {
  // Collect all unique conditionIds from the store
  const conditionIds = new Set<string>();
  for (const [, data] of store.entries()) {
    for (const bet of data.bets) {
      conditionIds.add(bet.conditionId);
    }
  }

  return Array.from(conditionIds)
    .map((cid) => getMarketSentiment(cid))
    .filter((s) => s.totalHumans > 0);
}

// ---------- Seed Demo Data ----------

/**
 * Populate the store with realistic demo bets from different "humans"
 */
