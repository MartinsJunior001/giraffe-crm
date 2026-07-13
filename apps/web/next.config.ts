import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Saída standalone para container mínimo (monorepo: raiz de tracing na raiz do repo).
  output: 'standalone',
  outputFileTracingRoot: path.join(dirname, '../../'),
  reactStrictMode: true,
};

export default nextConfig;
