import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import InstallPrompt from "@/components/InstallPrompt";

// ── Viewport (theme-color lives here in Next.js App Router) ─────────────────
export const viewport: Viewport = {
  themeColor: "#0d0d1a",
  width: "device-width",
  initialScale: 1,
};

// ── Page metadata ────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "Gesture Globe — Hand-Controlled Holographic Mesh",
  description:
    "Control a holographic wireframe sphere with your bare hands using real-time face and hand tracking powered by MediaPipe and Three.js. No mouse or keyboard needed.",
  keywords: [
    "hand tracking",
    "face mesh",
    "mediapipe",
    "three.js",
    "holographic sphere",
    "gesture control",
    "augmented reality",
    "webcam",
  ],
  // PWA / iOS Safari
  appleWebApp: {
    capable: true,
    title: "GestureGlobe",
    statusBarStyle: "black-translucent",
  },
  // apple-touch-icon links for each size
  icons: {
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-152.png",         sizes: "152x152", type: "image/png" },
      { url: "/icon-144.png",         sizes: "144x144", type: "image/png" },
      { url: "/icon-128.png",         sizes: "128x128", type: "image/png" },
      { url: "/icon-96.png",          sizes: "96x96",   type: "image/png" },
      { url: "/icon-72.png",          sizes: "72x72",   type: "image/png" },
    ],
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* Register service worker after load — zero impact on first paint */}
        <ServiceWorkerRegistrar />

        {/* Render install-to-homescreen banner when browser fires beforeinstallprompt */}
        <InstallPrompt />
      </body>
    </html>
  );
}
