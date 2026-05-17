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
}

export default nextConfig
