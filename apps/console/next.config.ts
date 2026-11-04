import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

/**
 * Dev only: Next 16 blocks dev resources (hot reload) for any origin other
 * than localhost. Allow 127.0.0.1 and this machine's LAN addresses, which
 * `next dev` itself prints as the "Network" URL.
 */
const localOrigins = [
  '127.0.0.1',
  ...Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: localOrigins,
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
