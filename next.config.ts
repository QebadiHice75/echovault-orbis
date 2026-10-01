import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
