import type { NextConfig } from "next";

// Pin Turbopack's workspace root to THIS project. Without this, Turbopack
// walks up the directory tree, finds C:\Users\Admin\package-lock.json, and
// tries to watch the entire home folder — which freezes the machine.
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
