"use client";

/**
 * InstallPrompt.tsx
 *
 * Listens for the browser's `beforeinstallprompt` event and renders a
 * dismissible "Install App" banner. Dismissed state is persisted in
 * localStorage so the banner doesn't reappear on every visit.
 */

import { useEffect, useState, useCallback } from "react";

// Extend Window for the non-standard BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "gg_install_dismissed";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed this session / ever
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault(); // suppress the mini-infobar
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  /** Trigger the install dialog */
  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem(DISMISSED_KEY, "true");
    }
    setDeferredPrompt(null);
    setVisible(false);
  }, [deferredPrompt]);

  /** Dismiss without installing */
  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDeferredPrompt(null);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      id="pwa-install-banner"
      role="dialog"
      aria-label="Install Gesture Globe app"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.85rem 1.25rem",
        background: "rgba(13, 13, 26, 0.92)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0, 212, 255, 0.35)",
        borderRadius: "10px",
        boxShadow: "0 0 30px rgba(0, 212, 255, 0.15), 0 8px 32px rgba(0,0,0,0.5)",
        fontFamily: "ui-monospace, monospace",
        fontSize: "0.82rem",
        color: "#e2e8f0",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
        animation: "slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
        }
      `}</style>

      {/* Icon */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon-72.png"
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        style={{ borderRadius: "8px" }}
      />

      <span style={{ color: "#94a3b8" }}>
        Install&nbsp;
        <strong style={{ color: "#00d4ff" }}>Gesture Globe</strong>
        &nbsp;for offline access
      </span>

      <button
        id="pwa-install-btn"
        onClick={handleInstall}
        style={{
          padding: "0.45rem 1rem",
          background: "rgba(0, 212, 255, 0.15)",
          border: "1px solid #00d4ff",
          borderRadius: "6px",
          color: "#00d4ff",
          fontFamily: "inherit",
          fontSize: "inherit",
          cursor: "pointer",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) =>
          ((e.target as HTMLButtonElement).style.background =
            "rgba(0,212,255,0.28)")
        }
        onMouseLeave={(e) =>
          ((e.target as HTMLButtonElement).style.background =
            "rgba(0,212,255,0.15)")
        }
      >
        Install
      </button>

      <button
        id="pwa-dismiss-btn"
        onClick={handleDismiss}
        aria-label="Dismiss install banner"
        style={{
          background: "none",
          border: "none",
          color: "#64748b",
          cursor: "pointer",
          fontSize: "1rem",
          lineHeight: 1,
          padding: "0.25rem",
          transition: "color 0.2s",
        }}
        onMouseEnter={(e) =>
          ((e.target as HTMLButtonElement).style.color = "#e2e8f0")
        }
        onMouseLeave={(e) =>
          ((e.target as HTMLButtonElement).style.color = "#64748b")
        }
      >
        ✕
      </button>
    </div>
  );
}
