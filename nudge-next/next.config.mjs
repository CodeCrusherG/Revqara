/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep server-only packages out of the client bundle.
    serverComponentsExternalPackages: ["node-appwrite", "razorpay"],
  },
};

export default nextConfig;
