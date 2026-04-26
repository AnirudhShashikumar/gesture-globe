import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading textures and WASM assets from external CDNs
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "unpkg.com",
      },
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
      },
    ],
  },

  webpack: (config) => {
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    return config;
  },

  // Pin Turbopack to this project directory to prevent broad filesystem watching.
  turbopack: {
    root: __dirname,
  },

  // ── PWA / Cache-Control headers ──────────────────────────────────────────
  async headers() {
    return [
      {
        // Service worker MUST be served without caching so browsers always
        // fetch the latest version and can trigger update flows promptly.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Web App Manifest — 24 h cache is fine; short enough to react to changes.
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Icons are content-hashed at build time — safe to cache for 1 year.
        source: "/:icon(icon-*|apple-touch-icon).png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

