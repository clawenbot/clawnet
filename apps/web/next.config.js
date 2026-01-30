/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Allow cloudflared dev tunnels
  allowedDevOrigins: [
    "*.trycloudflare.com",
  ],
};

module.exports = nextConfig;
