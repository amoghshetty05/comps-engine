/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg and mongodb are Node libraries; keep them out of the bundler.
  experimental: { serverComponentsExternalPackages: ["pg", "mongodb", "bcryptjs"] },
};
export default nextConfig;
