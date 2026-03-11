import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  output: isDev ? undefined : 'export',
  basePath: '/dashboard',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  ...(isDev && {
    // Skip trailing slash redirects in dev to avoid extra round-trips on /api/* proxy calls
    skipTrailingSlashRedirect: true,
    async rewrites() {
      const ashUrl = process.env.ASH_API_URL || 'http://localhost:4100'
      return {
        beforeFiles: [
          { source: '/api/:path*', destination: `${ashUrl}/api/:path*`, basePath: false as const },
          { source: '/health', destination: `${ashUrl}/health`, basePath: false as const },
          { source: '/dashboard/config.js', destination: `${ashUrl}/dashboard/config.js`, basePath: false as const },
        ],
      }
    },
  }),
}

export default nextConfig
