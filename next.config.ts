import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: "./",
  },
  transpilePackages: ["recharts"],
};

export default nextConfig;
