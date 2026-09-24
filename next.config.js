/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output produces a minimal, self-contained server (.next/standalone/server.js)
  // with only the node_modules it actually needs. That keeps the zip-deploy artifact small
  // and lets App Service start the app with `node server.js` instead of `next start`.
  output: "standalone",
};

module.exports = nextConfig;
