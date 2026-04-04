"use client";

import { useState, useCallback } from "react";
import { connectLedger, getLedgerAddress, isLedgerConnected } from "@/lib/ledger";

/**
 * Custom Ledger connect modal — replaces the web component.
 * Renders a clean BT/USB selection like the native Ledger Button.
 * Uses DMK directly for device connection.
 */

type ConnectionStep = "select" | "connecting" | "connected" | "error";

export function useLedgerConnect() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ConnectionStep>("select");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<"usb" | "bluetooth" | null>(null);

  const open = useCallback(() => {
    if (isLedgerConnected() && address) return; // already connected
    setStep("select");
    setError(null);
    setIsOpen(true);
  }, [address]);

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const connect = useCallback(async (method: "usb" | "bluetooth") => {
    setTransport(method);
    setStep("connecting");
    setError(null);

    try {
      const addr = await connectLedger(method);
      setAddress(addr);
      setStep("connected");
      // Auto-close after success
      setTimeout(() => setIsOpen(false), 1200);
    } catch (err: any) {
      console.error("[Ledger] Connection failed:", err);
      setError(err?.message || "Connection failed");
      setStep("error");
    }
  }, []);

  return { isOpen, open, close, step, address, error, transport, connect };
}

export function LedgerConnectModal({
  isOpen,
  onClose,
  step,
  error,
  transport,
  onConnect,
  onRetry,
}: {
  isOpen: boolean;
  onClose: () => void;
  step: ConnectionStep;
  error: string | null;
  transport: "usb" | "bluetooth" | null;
  onConnect: (method: "usb" | "bluetooth") => void;
  onRetry?: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#1a1a1a] rounded-2xl w-[420px] max-w-[90vw] shadow-2xl border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.5">
                <rect x="3" y="2" width="14" height="16" rx="2" />
                <rect x="6" y="5" width="8" height="5" rx="1" />
                <line x1="10" y1="13" x2="10" y2="15" />
              </svg>
            </div>
            <h2 className="text-white text-lg font-semibold">Connect a Ledger</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-4 space-y-3">
          {step === "select" && (
            <>
              {/* Bluetooth option */}
              <button
                onClick={() => onConnect("bluetooth")}
                className="w-full flex items-center gap-4 bg-[#252525] hover:bg-[#2a2a2a] rounded-xl p-4 transition group"
              >
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-white font-medium">Connect with Bluetooth</div>
                  <div className="text-gray-400 text-sm">Power on and unlock your device</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="gray" strokeWidth="2" className="flex-shrink-0">
                  <polyline points="6,3 11,8 6,13" />
                </svg>
              </button>

              {/* USB option */}
              <button
                onClick={() => onConnect("usb")}
                className="w-full flex items-center gap-4 bg-[#252525] hover:bg-[#2a2a2a] rounded-xl p-4 transition group"
              >
                <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M15 7v4h1v2h-3V5h2l-3-4-3 4h2v8H8v-2.07c.7-.37 1.2-1.08 1.2-1.93 0-1.21-.99-2.2-2.2-2.2-1.21 0-2.2.99-2.2 2.2 0 .85.5 1.56 1.2 1.93V13c0 1.11.89 2 2 2h3v3.05c-.71.37-1.2 1.1-1.2 1.95 0 1.22.99 2.2 2.2 2.2 1.21 0 2.2-.98 2.2-2.2 0-.85-.49-1.58-1.2-1.95V15h3c1.11 0 2-.89 2-2v-2h1V7h-4z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <div className="text-white font-medium">Connect with USB</div>
                  <div className="text-gray-400 text-sm">Plug in and unlock your device</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="gray" strokeWidth="2" className="flex-shrink-0">
                  <polyline points="6,3 11,8 6,13" />
                </svg>
              </button>
            </>
          )}

          {step === "connecting" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 border-3 border-gray-600 border-t-white rounded-full animate-spin" />
              <div className="text-white font-medium">
                Connecting via {transport === "bluetooth" ? "Bluetooth" : "USB"}...
              </div>
              <div className="text-gray-400 text-sm text-center">
                {transport === "bluetooth"
                  ? "Make sure your Ledger is powered on with Bluetooth enabled"
                  : "Make sure your Ledger is plugged in and unlocked"}
              </div>
            </div>
          )}

          {step === "connected" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                  <polyline points="4,12 9,17 20,6" />
                </svg>
              </div>
              <div className="text-green-400 font-medium">Connected</div>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </div>
              <div className="text-red-400 font-medium">Connection failed</div>
              <div className="text-gray-400 text-sm text-center max-w-[300px]">{error}</div>
              <button
                onClick={onRetry || onClose}
                className="text-sm text-blue-400 hover:text-blue-300 transition mt-2"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Footer — Get a Ledger device */}
        {step === "select" && (
          <div className="px-6 pb-6 pt-1">
            <a
              href="https://shop.ledger.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-[#252525] hover:bg-[#2a2a2a] rounded-xl p-4 transition"
            >
              <div className="w-10 h-10 bg-[#333] rounded-full flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 01-8 0" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-medium">Get a Ledger device</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="gray" strokeWidth="2" className="flex-shrink-0">
                <polyline points="6,3 11,8 6,13" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
