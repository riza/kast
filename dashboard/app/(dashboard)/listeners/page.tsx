"use client"

import * as React from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { api, APIMount, APIError } from "@/lib/api"
import { cn } from "@/lib/utils"

const POLL_INTERVAL = 5_000

function PulseDot({ status }: { status: APIMount["status"] }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      status === "live"  ? "bg-emerald-500 pulse-dot" :
      status === "error" ? "bg-red-500" : "bg-ink-600"
    )} />
  )
}

export default function ListenersPage() {
  const [mounts, setMounts]           = React.useState<APIMount[] | null>(null)
  const [error, setError]             = React.useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date())
  const [refreshing, setRefreshing]   = React.useState(false)

  const load = React.useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const data = await api.mounts.list()
      setMounts(data)
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof APIError ? e.message : "Failed to load mounts")
    } finally {
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
    const id = setInterval(() => load(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [load])

  const totalListeners = mounts?.reduce((s, m) => s + m.listeners, 0) ?? 0
  const liveMounts     = mounts?.filter((m) => m.status === "live") ?? []
  const idleMounts     = mounts?.filter((m) => m.status !== "live") ?? []

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Listeners</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {mounts !== null
              ? `${totalListeners} active across ${liveMounts.length} mount${liveMounts.length !== 1 ? "s" : ""} · updates every ${POLL_INTERVAL / 1000}s`
              : "Active stream consumers"
            }
          </p>
        </div>
        <button
          onClick={() => load(true)}
          className="flex items-center gap-1.5 text-[12px] text-ink-500 hover:text-ink-200 font-mono transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span className="tabular-nums">
            {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12.5px] text-red-400">
          {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="mt-8 grid grid-cols-3 gap-px bg-ink-800 border border-ink-800 rounded-lg overflow-hidden">
        <div className="bg-ink-950 px-5 py-4">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider">Total listeners</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-ink-100">
              {mounts !== null ? totalListeners : "—"}
            </span>
            {totalListeners > 0 && (
              <span className="text-[11px] text-emerald-400 font-mono">live</span>
            )}
          </div>
        </div>
        <div className="bg-ink-950 px-5 py-4">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider">Live mounts</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-emerald-400">
              {mounts !== null ? liveMounts.length : "—"}
            </span>
          </div>
        </div>
        <div className="bg-ink-950 px-5 py-4">
          <div className="text-[11px] text-ink-500 font-mono uppercase tracking-wider">Idle mounts</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[22px] font-bold text-ink-500">
              {mounts !== null ? idleMounts.length : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Per-mount */}
      <div className="mt-9">
        <h2 className="text-[11px] font-medium text-ink-500 uppercase tracking-wider font-mono mb-3">
          Per-mount
        </h2>

        {mounts === null ? (
          <div className="border-t border-ink-800 py-10 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
          </div>
        ) : mounts.length === 0 ? (
          <div className="border-t border-ink-800 py-10 flex flex-col items-center gap-2 text-ink-500">
            <p className="text-[12.5px]">No mounts configured</p>
            <Link href="/mounts" className="text-[12px] text-k-400 hover:text-k-300 transition-colors">
              Create a mount →
            </Link>
          </div>
        ) : (
          <div className="border-t border-ink-800">
            {/* Column headers */}
            <div className="grid grid-cols-[minmax(0,1.6fr)_140px_minmax(0,1fr)_60px] gap-3 px-1 py-2 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono border-b border-ink-800">
              <div>Mount</div>
              <div>Codec / Bitrate</div>
              <div>Activity</div>
              <div className="text-right">Lsnr</div>
            </div>

            {mounts.map((m, i) => (
              <div
                key={m.id}
                className={cn(
                  "kast-row grid grid-cols-[minmax(0,1.6fr)_140px_minmax(0,1fr)_60px] gap-3 px-1 py-3 items-center",
                  i < mounts.length - 1 && "border-b border-ink-800/60"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PulseDot status={m.status} />
                    <span className="font-mono text-[13.5px] text-ink-100 truncate">
                      {m.player_station_name || m.name}
                    </span>
                  </div>
                  {m.description && (
                    <div className="text-[11px] text-ink-500 font-mono mt-0.5 pl-3.5 truncate">{m.description}</div>
                  )}
                </div>
                <span className="text-[12px] font-mono text-ink-300">
                  {[m.codec, m.bitrate].filter(Boolean).join(" · ") || "—"}
                </span>
                <svg viewBox="0 0 120 24" preserveAspectRatio="none" className="w-full h-6">
                  <path d="M0,18 L20,16 L40,14 L60,12 L80,10 L100,8 L120,6" fill="none" stroke="#fb7314" strokeWidth="1.2"/>
                </svg>
                <span className={cn(
                  "text-right text-[14px] font-mono font-semibold",
                  m.listeners > 0 ? "text-ink-100" : "text-ink-600"
                )}>
                  {m.listeners}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-[11px] text-ink-600">
        Per-session detail (IP, duration, user-agent) requires server-side access logs.
      </p>
    </div>
  )
}
