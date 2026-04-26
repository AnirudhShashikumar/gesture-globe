// app/manifest.ts
// Next.js App Router file convention — Next.js automatically serves this at
// /manifest.webmanifest and injects the <link rel="manifest"> into the <head>.
// No manual <link> tag or public/manifest.json is needed.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gesture Globe — Hand-Controlled Holographic Mesh",
    short_name: "GestureGlobe",
    description:
      "Control a holographic wireframe sphere with your bare hands using real-time face and hand tracking powered by MediaPipe and Three.js.",
    start_url: "/",
    display: "standalone",
    orientation: "landscape-primary",
    theme_color: "#0d0d1a",
    background_color: "#0d0d1a",
    categories: ["entertainment", "utilities"],
    icons: [
      {
        src: "/icon-72.png",
        sizes: "72x72",
        type: "image/png",
      },
      {
        src: "/icon-96.png",
        sizes: "96x96",
        type: "image/png",
      },
      {
        src: "/icon-128.png",
        sizes: "128x128",
        type: "image/png",
      },
      {
        src: "/icon-144.png",
        sizes: "144x144",
        type: "image/png",
      },
      {
        src: "/icon-152.png",
        sizes: "152x152",
        type: "image/png",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-384.png",
        sizes: "384x384",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      // Maskable variant — same 512px asset; the icon artwork sits within the
      // safe zone so it survives adaptive-icon cropping on Android.
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
