import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // content/, drizzle/ and GUIDE.md are read at runtime from process.cwd(); the Dockerfile copies them.
};

export default nextConfig;
