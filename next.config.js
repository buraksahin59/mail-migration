/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark imapflow as external to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        'imapflow': 'commonjs imapflow',
      });
    }
    return config;
  },
}

module.exports = nextConfig
