/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // BACKEND_URL is a server-side-only env var — ideal for internal Railway network.
    // NEXT_PUBLIC_API_URL is the public fallback (set in Railway Variables tab).
    // If neither is set (local dev), proxy to the local FastAPI server.
    const apiUrl =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:5000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
