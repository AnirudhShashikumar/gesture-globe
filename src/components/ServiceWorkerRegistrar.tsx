"use client";

/**
 * ServiceWorkerRegistrar.tsx
 *
 * Registers /sw.js after the "load" event so the registration never blocks
 * first paint. This component renders nothing — it is purely a side-effect.
 *
 * App Router note: this is a Client Component dropped into the root layout
 * so it runs once globally, regardless of which page the user lands on.
 */

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.info("[SW] Registered, scope:", reg.scope);

          // Listen for an updated SW waiting to activate
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // A new version is available — you could show a toast here
                console.info("[SW] New version available. Reload to update.");
              }
            });
          });
        })
        .catch((err) => console.warn("[SW] Registration failed:", err));
    };

    // Guard: defer until after first paint
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
