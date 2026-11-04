import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The console always renders live order state; no component caching.
  // Server-only packages that use Node built-ins (node:sqlite, pino) stay external.
  serverExternalPackages: ['pino', '@courier/core', '@courier/gateway', '@courier/mock-bitrefill'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
