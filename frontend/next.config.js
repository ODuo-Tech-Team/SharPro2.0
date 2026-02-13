/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone', // Only for Docker - Vercel handles this automatically
  reactStrictMode: true,
  async rewrites() {
    const apiUrl = process.env.BACKEND_API_URL || "https://apisharkprov2.oduoassessoria.com.br";
    return [
      {
        source: "/backend-api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
