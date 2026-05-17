import { execSync } from "child_process"

function getGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["pipe", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return "unknown"
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_GIT_COMMIT: process.env.GIT_COMMIT || getGitCommit(),
    NEXT_PUBLIC_VERSION:    process.env.npm_package_version || "0.1.0",
  },
  // Proxy all backend paths through the Next.js server so the browser only
  // ever needs to reach the dashboard port — no separate server URL required.
  async rewrites() {
    const upstream = process.env.API_URL || "http://localhost:8080"
    const proxy = (src) => ({ source: src, destination: `${upstream}${src}` })
    return [
      proxy("/api/:path*"),
      proxy("/hls/:path*"),
      proxy("/source/:path*"),
      proxy("/whep/:path*"),
      proxy("/public/:path*"),
    ]
  },
}

export default nextConfig
