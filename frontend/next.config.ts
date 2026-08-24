import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up looking for a workspace root and can
  // land on an unrelated package-lock.json outside the repo (e.g. one sitting
  // in the home directory), which produces an incorrect root and a warning.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
