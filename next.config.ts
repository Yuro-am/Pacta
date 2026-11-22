import type { NextConfig } from "next";

const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;

const config: NextConfig = {
  agentRules: false,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_PACTA_URL: process.env.NEXT_PUBLIC_PACTA_URL || (vercelDomain ? `https://${vercelDomain}` : ""),
  },
};

export default config;
