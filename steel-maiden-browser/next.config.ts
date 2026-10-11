import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared release is served by the bundled lightweight launcher, so it
  // must contain a real index.html instead of requiring a Node/SSR process.
  output: 'export',
};

export default nextConfig;
