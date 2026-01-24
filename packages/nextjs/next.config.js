/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/app',
  assetPrefix: '/app',
  transpilePackages: ['@arbme/core-lib'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://warpcast.com',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://warpcast.com https://*.farcaster.xyz https://farcaster.xyz",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
