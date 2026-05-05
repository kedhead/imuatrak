/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Firebase Hosting + the firebase-frameworks integration handles SSR.
  // For the public session viewer we want server-rendering so Open Graph
  // tags are correct when links are pasted into iMessage / Twitter.
};

export default nextConfig;
