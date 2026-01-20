/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/app',
  output: 'standalone',
  transpilePackages: ['@arbme/core-lib'],
}

module.exports = nextConfig
