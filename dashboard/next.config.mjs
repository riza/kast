/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained server bundle for Docker deployment.
  // Copies only the required node_modules into .next/standalone.
  output: "standalone",
}

export default nextConfig
