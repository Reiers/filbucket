/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @filbucket/shared is a TS-source package. Its internal re-exports use
  // the standard nodenext convention of '.js' suffixes that resolve to
  // the matching '.ts' file at build time. Next's webpack default resolver
  // doesn't do that on its own, so we add a custom resolver below.
  transpilePackages: ['@filbucket/shared'],
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}
export default nextConfig
