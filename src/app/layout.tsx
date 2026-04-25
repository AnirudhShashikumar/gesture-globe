import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gesture Sphere — Hand-Controlled Holographic Mesh",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
