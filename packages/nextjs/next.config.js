/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@arbme/core-lib'],
  serverExternalPackages: ['@farcaster/miniapp-sdk'],
  webpack: (config, { isServer }) => {
    // Fix for WalletConnect/RainbowKit module resolution issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
      '@react-native-async-storage/async-storage': false,
    };
    // Exclude browser-only packages from server bundle
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('@farcaster/miniapp-sdk');
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://warpcast.com https://*.farcaster.xyz https://farcaster.xyz https://app.safe.global https://*.safe.global",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
