"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { setToken, isLoggedIn } from "@/lib/auth"

function getServerBase() {
  if (typeof window === "undefined") return ""
  return (
    localStorage.getItem("kast_api_url") ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, "")
}

type Mode = "loading" | "setup" | "login"

export default function LoginPage() {
  const router  = useRouter()
  const [mode, setMode]         = React.useState<Mode>("loading")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirm,  setConfirm]  = React.useState("")
  const [error, setError]       = React.useState<string | null>(null)
  const [loading, setLoading]   = React.useState(false)

  React.useEffect(() => {
    if (isLoggedIn()) { router.replace("/dashboard"); return }
    const base = getServerBase()
    fetch(`${base}/api/auth/setup`)
      .then((r) => r.json())
      .then((d) => setMode(d.data?.required ? "setup" : "login"))
      .catch(() => setMode("login"))
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === "setup" && password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const base = getServerBase()
      const endpoint = mode === "setup" ? "/api/auth/setup" : "/api/auth/login"
      const res = await fetch(`${base}${endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.")
        return
      }
      setToken(json.data.token)
      router.replace("/dashboard")
    } catch {
      setError("Could not connect to server.")
    } finally {
      setLoading(false)
    }
  }

  if (mode === "loading") {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-ink-800 border-t-k-500 rounded-full animate-spin" />
      </div>
    )
  }

  const isSetup = mode === "setup"

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

        <h1 className="text-[22px] font-bold text-ink-100 tracking-tight mb-1">
          {isSetup ? "Create admin account" : "Sign in"}
        </h1>
        <p className="text-[13px] text-ink-500 font-mono mb-8">
          {isSetup ? "First run — set up your admin credentials." : "Admin dashboard"}
        </p>

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
              placeholder={isSetup ? "admin" : ""}
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete={isSetup ? "new-password" : "current-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ink-900 border border-ink-700 text-ink-100 px-3 py-2.5 text-[13.5px] font-mono outline-none focus:border-k-500 transition-colors"
            />
          </div>

          {isSetup && (
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-ink-900 border border-ink-700 text-ink-100 px-3 py-2.5 text-[13.5px] font-mono outline-none focus:border-k-500 transition-colors"
              />
            </div>
          )}

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
            {loading
              ? (isSetup ? "Creating…" : "Signing in…")
              : (isSetup ? "Create account & sign in" : "Sign in")
            }
          </button>
        </form>
      </div>
    </div>
  )
}
