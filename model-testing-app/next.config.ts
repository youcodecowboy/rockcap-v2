import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse handles its own pdfjs-dist version internally
  serverExternalPackages: ['pdf-parse', 'canvas', '@napi-rs/canvas'],
  // Increase body size limit for file uploads (default is 10MB)
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
  // Next.js 16 uses Turbopack by default
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        canvas: 'commonjs canvas',
        '@napi-rs/canvas': 'commonjs @napi-rs/canvas',
      });
    }
    return config;
  },
};

export default nextConfig;
