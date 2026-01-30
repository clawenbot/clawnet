/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Allow cloudflared dev tunnels
  allowedDevOrigins: [
    "*.trycloudflare.com",
  ],

  // ===========================================
  // PRODUCTION OPTIMIZATIONS (2-core/4GB server)
  // ===========================================
  
  // Reduce memory usage during builds
  experimental: {
    // Reduce memory usage
    webpackMemoryOptimizations: true,
  },
  
  // Compress responses (built-in Next.js compression)
  compress: true,
  
  // Optimize images
  images: {
    // Use smaller image formats
    formats: ["image/avif", "image/webp"],
    // Limit concurrent image optimizations
    minimumCacheTTL: 86400, // 24 hours
  },
  
  // Reduce bundle size
  poweredByHeader: false,
  
  // Production source maps disabled to save memory
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
