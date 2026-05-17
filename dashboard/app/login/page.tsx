"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { setToken, isLoggedIn } from "@/lib/auth"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError]       = React.useState<string | null>(null)
  const [loading, setLoading]   = React.useState(false)

  React.useEffect(() => {
    if (isLoggedIn()) router.replace("/dashboard")
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.login(username, password)
      setToken(res.token)
      router.replace("/dashboard")
    } catch {
      setError("Invalid username or password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-9 h-9 bg-k-500 flex items-center justify-center">
            <span className="text-white font-mono text-[15px] font-bold">K</span>
          </div>
          <span className="font-mono text-[18px] font-semibold text-ink-100 tracking-tight">Kast</span>
        </div>

        <h1 className="text-[22px] font-bold text-ink-100 tracking-tight mb-1">Sign in</h1>
        <p className="text-[13px] text-ink-500 font-mono mb-8">Admin dashboard</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-ink-900 border border-ink-700 text-ink-100 px-3 py-2.5 text-[13.5px] font-mono outline-none focus:border-k-500 transition-colors"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ink-900 border border-ink-700 text-ink-100 px-3 py-2.5 text-[13.5px] font-mono outline-none focus:border-k-500 transition-colors"
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-400 font-mono border border-red-500/20 bg-red-500/5 px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-k-500 hover:bg-k-600 text-white font-mono text-[13px] font-semibold py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
