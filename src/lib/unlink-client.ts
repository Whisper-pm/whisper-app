// Unlink integration — real deposit, burner, bridge flow
// Wraps @unlink-xyz/sdk for the Whisper app

import {
  createUnlink,
  unlinkAccount,
  unlinkEvm,
  createUnlinkClient,
  BurnerWallet,
  type AccountKeys,
} from "@unlink-xyz/sdk";
import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  type WalletClient,
  type PublicClient,
} from "viem";
import { baseSepolia } from "viem/chains";
import { CONFIG } from "./config";

type HighLevelClient = ReturnType<typeof createUnlink>;
type ApiClient = ReturnType<typeof createUnlinkClient>;

export interface WhisperUnlink {
  unlink: HighLevelClient;
  apiClient: ApiClient;
  address: string;
  accountKeys: AccountKeys;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

/**
 * Create Unlink client from browser wallet (MetaMask/injected).
 */
export async function createWhisperUnlink(
  ethereum: any,
  passphrase: string
): Promise<WhisperUnlink> {
  const walletClient = createWalletClient({
    chain: baseSepolia,
    transport: custom(ethereum),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(CONFIG.chains.baseSepolia.rpc),
  });

  // Derive seed from passphrase (deterministic)
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  const seed = new Uint8Array(hashBuffer);

  const account = unlinkAccount.fromSeed({ seed });
  const accountKeys = await account.getAccountKeys();

  const unlink = createUnlink({
    engineUrl: CONFIG.unlink.engineUrl,
    apiKey: CONFIG.unlink.apiKey,
    account,
    evm: unlinkEvm.fromViem({ walletClient, publicClient }),
  });

  const apiClient = createUnlinkClient(CONFIG.unlink.engineUrl, CONFIG.unlink.apiKey);
  const address = await unlink.getAddress();

  // Ensure user is registered
  await unlink.ensureRegistered();

  return { unlink, apiClient, address, accountKeys, publicClient: publicClient as any, walletClient: walletClient as any };
}

/**
 * Deposit USDC into the Unlink privacy pool.
 */
export async function depositToPool(client: WhisperUnlink, amount: string) {
  // Ensure approval
  await client.unlink.ensureErc20Approval({
    token: CONFIG.unlink.usdc,
    amount: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  });

  // Deposit
  const result = await client.unlink.deposit({
    token: CONFIG.unlink.usdc,
    amount,
  });

  // Poll until done
  const final = await client.unlink.pollTransactionStatus(result.txId, {
    intervalMs: 3000,
    timeoutMs: 180_000,
  });

  return { txId: result.txId, status: final.status };
}

/**
 * Create a funded burner wallet from the privacy pool.
 * Returns a burner that can operate on any EVM chain.
 */
export async function createFundedBurner(client: WhisperUnlink, amount: string) {
  const burner = await BurnerWallet.create();

  const fundResult = await burner.fundFromPool(client.apiClient, {
    senderKeys: client.accountKeys,
    token: CONFIG.unlink.usdc,
    amount,
    environment: "base-sepolia",
  });

  // Wait for burner to be funded
  let status = "pending";
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const s = await burner.getStatus(client.apiClient);
      status = (s as any)?.status ?? status;
      if (status === "funded") break;
    } catch {
      // Burner may not be registered yet
    }
  }

  return {
    burner,
    address: burner.address,
    viemAccount: burner.toViemAccount(),
    status,
  };
}

/**
 * Re-deposit burner funds back into the privacy pool.
 */
export async function reshieldBurner(
  client: WhisperUnlink,
  burner: any,
  amount: string
) {
  const result = await burner.depositToPool(client.apiClient, {
    unlinkAddress: client.address,
    token: CONFIG.unlink.usdc,
    amount,
    environment: "base-sepolia",
    chainId: CONFIG.chains.baseSepolia.id,
    permit2Address: CONFIG.unlink.permit2,
    poolAddress: CONFIG.unlink.pool,
    deadline: Math.floor(Date.now() / 1000) + 3600,
  });

  return result;
}

/**
 * Withdraw from privacy pool to EVM address.
 */
export async function withdrawFromPool(
  client: WhisperUnlink,
  recipientAddress: `0x${string}`,
  amount: string
) {
  const result = await client.unlink.withdraw({
    recipientEvmAddress: recipientAddress,
    token: CONFIG.unlink.usdc,
    amount,
  });

  const final = await client.unlink.pollTransactionStatus(result.txId, {
    intervalMs: 3000,
    timeoutMs: 180_000,
  });

  return { txId: result.txId, status: final.status };
}

/**
 * Get pool balance.
 */
export async function getPoolBalance(client: WhisperUnlink) {
  const balances = await client.unlink.getBalances();
  const usdcBalance = (balances as any).balances?.find(
    (b: any) => b.token?.toLowerCase() === CONFIG.unlink.usdc.toLowerCase()
  );
  return usdcBalance ? BigInt(usdcBalance.amount) : 0n;
}
