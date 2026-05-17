"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
const WEAK_PASSWORDS = new Set([
  "admin", "password", "123456", "12345678", "1234", "test",
  "changeme", "changeme123", "pass", "qwerty", "letmein", "welcome",
])

function isWeakCredential(username: string, password: string) {
  return username === password || WEAK_PASSWORDS.has(password.toLowerCase())
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
  const [weakWarn, setWeakWarn] = React.useState(false)

  React.useEffect(() => {
    // Redirect if already authenticated (valid cookie).
    fetch("/api/auth/me", { credentials: "include" }).then((r) => {
      if (r.ok) { router.replace("/dashboard"); return }
      fetch("/api/auth/setup")
        .then((r) => r.json())
        .then((d) => setMode(d.required ? "setup" : "login"))
        .catch(() => setMode("login"))
    }).catch(() => setMode("login"))
  }, [router])

  const doSubmit = async () => {
    setWeakWarn(false)
    setLoading(true)
    try {
      const endpoint = mode === "setup" ? "/api/auth/setup" : "/api/auth/login"
      const res = await fetch(endpoint, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ username, password }),
        credentials: "include",
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.")
        return
      }
      router.replace("/dashboard")
    } catch {
      setError("Could not connect to server.")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === "setup" && password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    if (!weakWarn && isWeakCredential(username, password)) {
      setWeakWarn(true)
      return
    }

    doSubmit()
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

          {weakWarn && (
            <div className="border border-amber-500/30 bg-amber-500/5 px-3 py-3 space-y-2">
              <p className="text-[12px] text-amber-400 font-mono">
                This is a commonly used credential. Anyone who knows your username can guess it.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doSubmit}
                  className="text-[11px] font-mono text-amber-400 border border-amber-500/30 px-2.5 py-1 hover:bg-amber-500/10 transition-colors"
                >
                  Use anyway
                </button>
                <button
                  type="button"
                  onClick={() => { setWeakWarn(false); setPassword(""); setConfirm("") }}
                  className="text-[11px] font-mono text-ink-400 border border-ink-700 px-2.5 py-1 hover:bg-ink-800 transition-colors"
                >
                  Change password
                </button>
              </div>
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
