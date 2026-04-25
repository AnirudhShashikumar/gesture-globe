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
};

export default nextConfig;
