/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./db/migrations/**/*"],
  },
};

export default nextConfig;
