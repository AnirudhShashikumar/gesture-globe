// app/page.tsx — Entry point. Dynamically imports TrackingView (client-only)
// to avoid SSR issues with MediaPipe and Three.js.

"use client";

import dynamic from "next/dynamic";

// Dynamic import with SSR disabled — MediaPipe and Three.js require browser APIs
const TrackingView = dynamic(() => import("@/components/TrackingView"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        color: "#39FF14",
        fontFamily: "monospace",
        fontSize: "14px",
        letterSpacing: "2px",
      }}
    >
      LOADING MODULES...
    </div>
  ),
});

export default function Home() {
  return (
    <main>
      <TrackingView />
    </main>
  );
}
