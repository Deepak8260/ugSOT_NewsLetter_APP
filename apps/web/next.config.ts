import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VITE_DEV_URL:
      process.env.NEXT_PUBLIC_VITE_DEV_URL ?? "http://localhost:5173",
  },
};

export default nextConfig;
