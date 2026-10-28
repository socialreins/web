import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AGENTS.md is hand-written; the generated Next.js block contains em dashes.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  headers: async () => [
    {
      source: "/:path*",
      // Content-Security-Policy is set in proxy.ts.
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
