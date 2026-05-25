"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { api, type APIListener, type APIMount, APIError } from "@/lib/api"
import { cn, formatInTZ } from "@/lib/utils"
import { SettingsContext } from "@/app/(dashboard)/layout"

const POLL_INTERVAL = 5_000

// ── Helpers ──

function isPrivate(ip: string): boolean {
  const s = ip.toLowerCase()
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.)/.test(s)) return true
  if (s === "::1") return true
  if (/^fe[89ab][0-9a-f]:/.test(s)) return true   // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(s)) return true   // ULA fc00::/7
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivate(mapped[1])
  return false
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ""
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("")
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 5)  return "just now"
  if (diff < 60) return `${diff}s ago`
  return `${Math.floor(diff / 60)}m ago`
}

function fmtListeningDuration(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function parseUA(ua: string): string {
  if (!ua) return "—"
  const s = ua.toLowerCase()
  if (s.includes("vlc"))             return "VLC"
  if (s.includes("mpv"))             return "mpv"
  if (s.includes("lavf"))            return "FFmpeg"
  if (s.includes("liquidsoap"))      return "Liquidsoap"
  if (s.startsWith("curl"))          return "cURL"
  if (s.includes("python-requests")) return "Python"
  if (s.includes("applecoremedia"))  return "AirPlay"
  if (s.includes("itunes"))          return "iTunes"
  if (s.includes("edg/"))            return "Edge"
  if (s.includes("chrome"))          return "Chrome"
  if (s.includes("firefox"))         return "Firefox"
  if (s.includes("safari"))          return "Safari"
  const first = ua.split(/[/ ]/)[0]
  return first.length > 14 ? first.slice(0, 14) + "…" : first
}

// ── Row ──

function ListenerRow({ entry, mountNames }: { entry: APIListener; mountNames: Map<string, string> }) {
  const mountLabel = mountNames.get(entry.mount) ?? entry.mount
  const since      = entry.connected_at
    ? fmtListeningDuration(entry.connected_at)
    : timeAgo(entry.last_seen)

  const location = isPrivate(entry.ip)
    ? <span className="text-ink-500">Local</span>
    : entry.country_code
      ? <span className="flex items-center gap-1.5">
          <span>{countryFlag(entry.country_code)}</span>
          <span className="text-ink-300">{countryName(entry.country_code)}</span>
        </span>
      : <span className="text-ink-600">—</span>

  const client = parseUA(entry.user_agent)

  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_90px_minmax(0,1fr)_72px] gap-3 px-1 py-3 items-center border-b border-ink-800/60 last:border-0">
      <span className="font-mono text-[13px] text-ink-100 truncate" title={entry.ip}>{entry.ip}</span>
      <span className="text-[12.5px] font-mono truncate">{location}</span>
      <span
        className="font-mono text-[11.5px] text-ink-400 truncate"
        title={entry.user_agent || undefined}
      >{client}</span>
      <span className="font-mono text-[12.5px] text-k-400 truncate">{mountLabel}</span>
      <span className="text-right text-[11.5px] text-ink-500 font-mono">{since}</span>
    </div>
  )
}

// ── Page ──

export default function ListenersPage() {
  const { timezone } = React.useContext(SettingsContext)
  const [listeners, setListeners] = React.useState<APIListener[] | null>(null)
  const [mounts,    setMounts]    = React.useState<APIMount[]>([])
  const [error,     setError]     = React.useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date())
  const [refreshing,  setRefreshing]  = React.useState(false)
  const [mountFilter, setMountFilter] = React.useState<string | null>(null)

  const mountNames = React.useMemo(() => {
    const m = new Map<string, string>()
    mounts.forEach(mt => m.set(mt.name, mt.player_station_name || mt.name))
    return m
  }, [mounts])

  const activeMounts = React.useMemo(() => {
    if (!listeners) return []
    const counts = new Map<string, number>()
    for (const l of listeners) counts.set(l.mount, (counts.get(l.mount) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [listeners])

  const filtered = React.useMemo(() =>
    mountFilter ? (listeners ?? []).filter(l => l.mount === mountFilter) : (listeners ?? []),
    [listeners, mountFilter]
  )

  const load = React.useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const [ls, ms] = await Promise.all([api.listeners.list(), api.mounts.list()])
      setListeners(ls)
      setMounts(ms)
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof APIError ? e.message : "Failed to load")
    } finally {
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
    const id = setInterval(() => load(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [load])

  const total      = listeners?.length ?? 0
  const liveMounts = mounts.filter(m => m.status === "live").length
  const idleMounts = mounts.filter(m => m.status !== "live").length

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Listeners</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {listeners !== null
              ? `${total} active · updates every ${POLL_INTERVAL / 1000}s`
              : "Active stream consumers"}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          className="flex items-center gap-1.5 text-[12px] text-ink-500 hover:text-ink-200 font-mono transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span className="tabular-nums">
            {formatInTZ(lastRefresh, timezone)}
          </span>
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12.5px] text-red-400">
          {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-px bg-ink-800 border border-ink-800 rounded-lg overflow-hidden mb-9">
        <div className="bg-ink-950 px-5 py-4">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider">Total listeners</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-ink-100">{listeners !== null ? total : "—"}</span>
            {total > 0 && <span className="text-[11px] text-emerald-400 font-mono">live</span>}
          </div>
        </div>
        <div className="bg-ink-950 px-5 py-4">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider">Live mounts</div>
          <div className="mt-1.5">
            <span className="text-[22px] font-bold text-emerald-400">{listeners !== null ? liveMounts : "—"}</span>
          </div>
        </div>
        <div className="bg-ink-950 px-5 py-4">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider">Idle mounts</div>
          <div className="mt-1.5">
            <span className="text-[22px] font-bold text-ink-500">{listeners !== null ? idleMounts : "—"}</span>
          </div>
        </div>
      </div>

      {/* Listener table */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-[11px] font-medium text-ink-500 uppercase tracking-wider font-mono">
          {mountFilter
            ? `${filtered.length} listener${filtered.length !== 1 ? "s" : ""} on ${mountNames.get(mountFilter) ?? mountFilter}`
            : "Active listeners"}
        </h2>
        {activeMounts.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMountFilter(null)}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                mountFilter === null
                  ? "bg-k-500/20 text-k-400 border border-k-500/40"
                  : "text-ink-500 hover:text-ink-300 border border-transparent"
              )}
            >
              All
            </button>
            {activeMounts.map(([mount, count]) => (
              <button
                key={mount}
                onClick={() => setMountFilter(mount === mountFilter ? null : mount)}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
                  mountFilter === mount
                    ? "bg-k-500/20 text-k-400 border border-k-500/40"
                    : "text-ink-500 hover:text-ink-300 border border-transparent"
                )}
              >
                {mountNames.get(mount) ?? mount}
                <span className="ml-1.5 text-ink-600">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {listeners === null ? (
        <div className="border-t border-ink-800 py-10 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
        </div>
      ) : listeners.length === 0 ? (
        <div className="border-t border-ink-800 py-10 flex flex-col items-center gap-1 text-ink-600">
          <p className="text-[12.5px]">No active listeners</p>
          <p className="text-[11.5px]">Listeners appear when someone is actively streaming</p>
        </div>
      ) : (
        <div className="border-t border-ink-800">
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_90px_minmax(0,1fr)_72px] gap-3 px-1 py-2 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono border-b border-ink-800">
            <div>IP</div>
            <div>Location</div>
            <div>Client</div>
            <div>Mount</div>
            <div className="text-right">Since</div>
          </div>
          {filtered.map((l, i) => (
            <ListenerRow key={`${l.ip}-${l.mount}-${i}`} entry={l} mountNames={mountNames} />
          ))}
        </div>
      )}
    </div>
  )
}
