import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules used by the server-side renderer must not be bundled.
  serverExternalPackages: ["@napi-rs/canvas", "node-web-audio-api"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
