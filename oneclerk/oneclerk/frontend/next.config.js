/** @type {import('next').NextConfig} */
function isPrivateHost(hostname) {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (lower.startsWith('10.') || lower.startsWith('192.168.')) {
    return true;
  }
  const match172 = lower.match(/^172\.(\d{1,2})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

function shouldUseBackendRewrite(backendUrl) {
  if (!backendUrl) return false;
  try {
    const parsed = new URL(backendUrl);
    // In production, rewrites must target a public host.
    if (process.env.NODE_ENV === 'production' && isPrivateHost(parsed.hostname)) {
      console.warn(
        `Skipping rewrites for private backend host "${parsed.hostname}". Set NEXT_PUBLIC_API_URL to a public HTTPS URL.`
      );
      return false;
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    console.warn('Skipping rewrites because NEXT_PUBLIC_API_URL is not a valid URL.');
    return false;
  }
}

const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['*.replit.dev', '*.repl.co', '*.worf.replit.dev'],
  async rewrites() {
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');
    if (!shouldUseBackendRewrite(backendUrl)) {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/static/:path*',
        destination: `${backendUrl}/static/:path*`,
      },
      {
        source: '/app',
        destination: `${backendUrl}/app`,
      },
      {
        source: '/app/:path*',
        destination: `${backendUrl}/app/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
