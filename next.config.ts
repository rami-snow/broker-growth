import type { NextConfig } from "next";

// The dev indicator sits bottom-right so it never covers the sidebar account area. Errors still surface.
const nextConfig: NextConfig = { reactStrictMode: true, allowedDevOrigins: ["127.0.0.1"], devIndicators: { position: "bottom-right" } };
export default nextConfig;
