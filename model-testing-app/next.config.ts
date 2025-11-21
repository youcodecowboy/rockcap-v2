import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse handles its own pdfjs-dist version internally
  serverExternalPackages: ['pdf-parse'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude canvas from server-side bundle (if needed)
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
