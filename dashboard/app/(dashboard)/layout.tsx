"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { fetchMe, logout, type AuthUser } from "@/lib/auth"
import { api } from "@/lib/api"
import {
  LayoutDashboard,
  Radio,
  Users,
  Music2,
  ListMusic,
  CalendarClock,
  Webhook,
  KeyRound,
  Settings,
  LogOut,
} from "lucide-react"

// ── Navigation Definition ──

type NavItem = {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Overview",    icon: LayoutDashboard },
  { path: "/mounts",    label: "Mounts",      icon: Radio },
  { path: "/listeners", label: "Listeners",   icon: Users },
  { path: "/library",   label: "Library",     icon: Music2 },
  { path: "/playlists", label: "Playlists",   icon: ListMusic },
  { path: "/scheduled-playlists", label: "Schedules", icon: CalendarClock },
  { path: "/webhooks",  label: "Webhooks",    icon: Webhook },
  { path: "/access",    label: "Access & Auth", icon: KeyRound },
  { path: "/settings",  label: "Settings",    icon: Settings },
]

// ── Navigation Pending Context ──

const NavigationContext = React.createContext<{ pendingPath: string | null }>({
  pendingPath: null,
})

function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [pendingPath, setPendingPath] = React.useState<string | null>(null)

  React.useEffect(() => { setPendingPath(null) }, [pathname])

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || e.metaKey || e.ctrlKey) return
      const href = anchor.getAttribute("href")
      if (href && href.startsWith("/") && href !== pathname) setPendingPath(href)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [pathname])

  return (
    <NavigationContext.Provider value={{ pendingPath }}>
      {pendingPath && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5">
          <div
            className="h-full bg-k-500"
            style={{ animation: "progress 2s ease-in-out infinite" }}
          />
          <style>{`
            @keyframes progress {
              0%   { width: 0%; }
              50%  { width: 70%; }
              100% { width: 95%; }
            }
          `}</style>
        </div>
      )}
      {children}
    </NavigationContext.Provider>
  )
}

// ── GitHub icon ──

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.34-3.369-1.34-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  )
}

// ── Settings context ──

type SettingsCtx = { timezone: string; publicUrl: string; refresh: () => void }
export const SettingsContext = React.createContext<SettingsCtx>({ timezone: "UTC", publicUrl: "", refresh: () => {} })

function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState({ timezone: "UTC", publicUrl: "" })
  const load = React.useCallback(() => {
    api.settings.get()
      .then((s) => {
        const publicUrl = s.public_url ?? ""
        setSettings({ timezone: s.timezone ?? "UTC", publicUrl })
        if (publicUrl) localStorage.setItem("kast_api_url", publicUrl)
      })
      .catch(() => {})
  }, [])
  React.useEffect(() => { load() }, [load])
  return (
    <SettingsContext.Provider value={{ ...settings, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  )
}

// ── User context ──

const UserContext = React.createContext<AuthUser | null>(null)

// ── Auth guard ──

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<"loading" | "authed" | "unauthed">("loading")
  const [user, setUser]   = React.useState<AuthUser | null>(null)

  React.useEffect(() => {
    fetchMe().then((u) => {
      if (u) { setUser(u); setState("authed") }
      else     setState("unauthed")
    })
  }, [])

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-ink-800 border-t-k-500 rounded-full animate-spin" />
      </div>
    )
  }
  if (state === "unauthed") {
    if (typeof window !== "undefined") window.location.replace("/login")
    return null
  }
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

// ── Shell ──

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { pendingPath } = React.useContext(NavigationContext)
  const activePath = pendingPath ?? pathname
  const user = React.useContext(UserContext)

  const handleLogout = async () => {
    await logout()
    window.location.href = "/login"
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-ink-950">

      {/* ── Sidebar ── */}
      <aside className="w-[220px] shrink-0 flex flex-col bg-ink-900 border-r border-ink-800">

        {/* Logo */}
        <div className="h-14 px-3 flex items-center gap-2.5 border-b border-ink-800 shrink-0">
          <div className="h-7 w-7 rounded-md bg-k-500/15 border border-k-500/40 text-k-400 flex items-center justify-center font-bold text-[13px] shrink-0">
            K
          </div>
          <span className="text-[14px] font-semibold text-ink-100 leading-none">Kast</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              activePath === item.path || activePath.startsWith(item.path + "/")
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] transition-colors",
                  isActive
                    ? "bg-ink-800 text-ink-100"
                    : "text-ink-400 hover:bg-ink-800 hover:text-ink-200"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-ink-800 px-4 py-3 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-ink-500 font-mono">v0.9.1-beta</span>
          <a
            href="https://github.com/riza/kast"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-500 hover:text-ink-300 transition-colors"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-14 shrink-0 border-b border-ink-800 bg-ink-900 flex items-center px-6 gap-3">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 bg-k-500 text-white text-[11px] font-bold flex items-center justify-center select-none uppercase">
                {user?.username?.[0] ?? "?"}
              </div>
              <span className="text-[12px] font-mono text-ink-400">{user?.username}</span>
              {user?.role !== "admin" && (
                <span className="text-[10px] font-mono text-ink-600 uppercase tracking-wider">{user?.role}</span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="h-7 w-7 flex items-center justify-center text-ink-500 hover:text-ink-200 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[980px] px-8 py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Export ──

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SettingsProvider>
        <NavigationProvider>
          <DashboardShell>{children}</DashboardShell>
        </NavigationProvider>
      </SettingsProvider>
    </AuthGuard>
  )
}
