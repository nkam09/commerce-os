/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Render deployment
  output: "standalone",
  
  // Suppress build warnings for dynamic API routes
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};

module.exports = nextConfig;
