/** @type {import('next').NextConfig} */
const nextConfig = {
  // The invitation is a single static page: export it as plain files so it can
  // be served from any static host with no Node runtime.
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
