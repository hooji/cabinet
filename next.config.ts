import type { NextConfig } from "next";

// Next.js blocks cross-origin dev requests (HMR, /_next/*) from any Host
// not listed here. The agent bridge runs on a LAN box, so allow the
// configured origin in addition to loopback.
function resolveAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["127.0.0.1", "localhost"]);
  const appOrigin = process.env.AGENT_BRIDGE_APP_ORIGIN?.trim();
  if (appOrigin) {
    try {
      const { hostname } = new URL(appOrigin);
      if (hostname) origins.add(hostname);
    } catch {
      // ignore malformed
    }
  }
  return Array.from(origins);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: resolveAllowedDevOrigins(),
  output: "standalone",
  devIndicators: false,
};

export default nextConfig;
