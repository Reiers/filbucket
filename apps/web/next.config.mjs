/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We don't transpile @filbucket/shared; it ships compiled dist/ for SSR.
  // If that causes issues during dev, add: transpilePackages: ['@filbucket/shared'].
  transpilePackages: ['@filbucket/shared'],
}
export default nextConfig
