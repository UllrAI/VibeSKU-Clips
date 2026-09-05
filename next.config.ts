import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a minimal standalone server for container deployments.
  output: "standalone",
  // better-sqlite3 is a native module; mark it external (loaded via require, so the bundler won't try to bundle its .node file)
  serverExternalPackages: ["better-sqlite3"],
  // Exclude local data and development-only folders from the standalone server trace.
  outputFileTracingExcludes: {
    "/**": ["./.git/**", "./.github/**", "./data/**", "./e2e/**"],
  },
};

export default nextConfig;
