"use client";

import { IDKitRequestWidget, orbLegacy } from "@worldcoin/idkit";
import type { IDKitResult } from "@worldcoin/idkit";
import { CONFIG } from "@/lib/config";
import { useState, useEffect, useCallback, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onVerified?: (nullifierHash: string) => void;
}

export function WorldIdGate({ children, onVerified }: Props) {
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rpContext, setRpContext] = useState<any>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [widgetOpen, setWidgetOpen] = useState(false);

  // Fetch signed rp_context from backend
  useEffect(() => {
    fetch("/api/worldid")
      .then((r) => r.json())
      .then((d) => {
        if (d.rp_context) {
          setRpContext(d.rp_context);
        } else {
          setError(d.error ?? "Failed to load World ID config");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setContextLoading(false));
  }, []);

  const handleSuccess = useCallback(async (result: IDKitResult) => {
    if (verifying || verified) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
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
      setVerifying(false);
    }
  }, [verifying, verified, onVerified]);

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
          Zero-knowledge proofs protect your identity.
        </p>
      </div>

      <div className="flex flex-col gap-3 items-center" suppressHydrationWarning>
        {contextLoading ? (
          <button disabled className="bg-gray-700 text-gray-400 font-semibold px-10 py-3.5 rounded-full opacity-50">
            Loading World ID...
          </button>
        ) : rpContext ? (
          <>
            <button
              onClick={() => setWidgetOpen(true)}
              className="bg-white text-black font-semibold px-10 py-3.5 rounded-full hover:bg-gray-100 transition shadow-lg cursor-pointer"
            >
              Verify with World ID
            </button>
            <IDKitRequestWidget
              app_id={CONFIG.worldId.appId as `app_${string}`}
              action={CONFIG.worldId.action}
              preset={orbLegacy()}
              rp_context={rpContext}
              allow_legacy_proofs={true}
              open={widgetOpen}
              onOpenChange={setWidgetOpen}
              onSuccess={handleSuccess}
              onError={(code) => setError(String(code))}
              autoClose
            />
          </>
        ) : (
          <p className="text-xs text-red-400">World ID config error</p>
        )}

        {verifying && <p className="text-xs text-yellow-400 animate-pulse">Verifying proof...</p>}
        <p className="text-xs text-green-600">World ID 4.0</p>

        {/* DEV ONLY: skip World ID */}
        <button
          onClick={() => {
            setVerified(true);
            onVerified?.("dev-nullifier-" + Date.now());
          }}
          className="text-xs text-gray-600 underline hover:text-gray-400 cursor-pointer mt-2"
        >
          [Dev] Skip verification
        </button>
      </div>

      {error && <p className="text-xs text-red-400 max-w-sm text-center">{error}</p>}

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
