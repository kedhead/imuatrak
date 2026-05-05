/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deployed on Vercel — SSR is automatic. The public session viewer
  // renders on the server so Open Graph tags are correct when links are
  // pasted into iMessage / Twitter.
};

export default nextConfig;
