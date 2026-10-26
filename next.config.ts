import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AGENTS.md is hand-written; the generated Next.js block contains em dashes.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
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
