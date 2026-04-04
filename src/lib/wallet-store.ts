// Wallet tracking — maps burner wallets to their parent identity
// Persisted to JSON file for durability across restarts

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const STORE_PATH = join(process.cwd(), "wallets.json");

export interface BurnerRecord {
  burnerAddress: string;
  createdAt: string;
  parentEvmAddress: string;
  unlinkAddress: string;
  betId?: string;
  market?: string;
  side?: string;
  amount?: string;
  status: "funded" | "bridged" | "bet_placed" | "swept" | "disposed";
  txHashes: {
    fundFromPool?: string;
    cctpBurn?: string;
    cctpReceive?: string;
    splitPosition?: string;
    sweepBack?: string;
  };
}

interface WalletStore {
  burners: BurnerRecord[];
}

function load(): WalletStore {
  if (!existsSync(STORE_PATH)) return { burners: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { burners: [] };
  }
}

function save(store: WalletStore) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function addBurner(record: BurnerRecord) {
  const store = load();
  store.burners.push(record);
  save(store);
}

export function updateBurner(burnerAddress: string, update: Partial<BurnerRecord>) {
  const store = load();
  const idx = store.burners.findIndex((b) => b.burnerAddress.toLowerCase() === burnerAddress.toLowerCase());
  if (idx >= 0) {
    store.burners[idx] = { ...store.burners[idx], ...update };
    if (update.txHashes) {
      store.burners[idx].txHashes = { ...store.burners[idx].txHashes, ...update.txHashes };
    }
    save(store);
  }
}

export function getBurnersByParent(evmAddress: string): BurnerRecord[] {
  const store = load();
  return store.burners.filter((b) => b.parentEvmAddress.toLowerCase() === evmAddress.toLowerCase());
}

export function getAllBurners(): BurnerRecord[] {
  return load().burners;
}
