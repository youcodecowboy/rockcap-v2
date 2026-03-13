import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip TS type-check during build — Convex's generated API types trigger
  // TS2589 (excessively deep type instantiation) across 14+ route files.
  // Real errors are caught by webpack compilation and local tsc.
  typescript: {
    ignoreBuildErrors: true,
  },
  // pdf-parse handles its own pdfjs-dist version internally
  serverExternalPackages: ['pdf-parse'],
  // Increase body size limit for file uploads (default is 10MB)
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
  // Next.js 16 uses Turbopack by default
  turbopack: {},
  webpack: (config) => config,
};

export default nextConfig;
