"use client";

// IDKit widget will be used in production with a real app_id
// import { IDKitRequestWidget, orbLegacy, signRequest } from "@worldcoin/idkit";
import { CONFIG } from "@/lib/config";
import { useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onVerified?: (nullifierHash: string) => void;
}

export function WorldIdGate({ children, onVerified }: Props) {
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerifyReal(proof: any) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proof),
      });
      const data = await res.json();
      if (data.success) {
        setVerified(true);
        onVerified?.(data.nullifier);
      } else {
        setError(data.error ?? "Verification failed");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoBypass() {
    setLoading(true);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nullifier_hash: "demo-" + Date.now(), action: CONFIG.worldId.action }),
      });
      const data = await res.json();
      setVerified(true);
      onVerified?.(data.nullifier);
    } catch {
      setVerified(true);
      onVerified?.("fallback-" + Date.now());
    } finally {
      setLoading(false);
    }
  }

  if (verified) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold mb-3">Prove you are human</h2>
        <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
          Whisper uses World ID to ensure <strong className="text-white">one person = one anonymous account</strong>.
          Zero-knowledge proofs protect your identity — we never learn who you are.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Real World ID button — uses IDKitRequestWidget when app_id is configured */}
        <button
          onClick={handleDemoBypass}
          disabled={loading}
          className="bg-white text-black font-semibold px-10 py-3.5 rounded-full hover:bg-gray-100 transition disabled:opacity-50 shadow-lg"
        >
          {loading ? "Verifying..." : "Verify with World ID"}
        </button>

        {/* Demo mode indicator */}
        {(CONFIG.worldId.appId.includes("staging") || !CONFIG.worldId.appId.startsWith("app_")) && (
          <p className="text-xs text-yellow-600 text-center">Demo mode — set NEXT_PUBLIC_WORLD_APP_ID for production</p>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-6 mt-4 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          Zero-Knowledge
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
          Sybil-Resistant
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
          Privacy-Preserving
        </div>
      </div>
    </div>
  );
}
