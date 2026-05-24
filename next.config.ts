import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Config options here */
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["recharts", "papaparse"],
  },
};

export default nextConfig;
