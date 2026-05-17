"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Search, Copy, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { api, type APIMount } from "@/lib/api"

// ── Types ──

export type Mount = {
  id: string; name: string; protocol: string; codec: string; bitrate: string
  listeners: number; status: "idle" | "live" | "error"; created: string
  description: string; genre: string; website: string
  playerStationName: string; playerAccent: string; playerAccentSoft: string
  playerTheme: string; playerLayout: string; playerAmbient: boolean
  playerShowAbout: boolean; playerShowHistory: boolean; playerShowPlaylist: boolean
}

export function adaptApiMount(m: APIMount): Mount {
  return {
    id: m.id, name: m.name, protocol: m.protocol || "HLS",
    codec: m.codec || "AAC", bitrate: m.bitrate || "128k",
    listeners: m.listeners, status: m.status as Mount["status"],
    created: m.created_at.slice(0, 10), description: m.description,
    genre: m.genre, website: m.website,
    playerStationName: m.player_station_name ?? "",
    playerAccent: m.player_accent ?? "#E85D2F",
    playerAccentSoft: m.player_accent_soft ?? "rgba(232,93,47,0.16)",
    playerTheme: m.player_theme ?? "dark",
    playerLayout: m.player_layout ?? "split",
    playerAmbient: m.player_ambient ?? true,
    playerShowAbout: m.player_show_about ?? true,
    playerShowHistory: m.player_show_history ?? true,
    playerShowPlaylist: m.player_show_playlist ?? true,
  }
}

// ── Design primitives ──

export function PulseDot({ status }: { status: Mount["status"] }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      status === "live"  ? "bg-emerald-500 pulse-dot" :
      status === "error" ? "bg-red-500" : "bg-ink-600"
    )} />
  )
}

export function KBtn({
  onClick, title, children, className,
}: { onClick?: React.MouseEventHandler<HTMLButtonElement>; title?: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("h-7 w-7 rounded-md hover:bg-ink-800 text-ink-400 hover:text-ink-200 flex items-center justify-center transition-colors shrink-0", className)}
    >
      {children}
    </button>
  )
}

// ── Create Mount Dialog ──

function CreateMountDialog({ onCreated }: { onCreated: (m: Mount) => void }) {
  const [open, setOpen]                     = React.useState(false)
  const [name, setName]                     = React.useState("")
  const [sourcePassword, setSourcePassword] = React.useState("")
  const [bitrate, setBitrate]               = React.useState("128k")
  const [codec, setCodec]                   = React.useState("AAC")
  const [protocol, setProtocol]             = React.useState("HLS")
  const [description, setDescription]       = React.useState("")
  const [genre, setGenre]                   = React.useState("")
  const [loading, setLoading]               = React.useState(false)

  const reset = () => { setName(""); setSourcePassword(""); setDescription(""); setGenre(""); setBitrate("128k"); setCodec("AAC"); setProtocol("HLS") }

  const handleCreate = () => {
    if (!name.trim() || sourcePassword.length < 8) return
    setLoading(true)
    const normalized = name.startsWith("/") ? name : "/" + name
    api.mounts.create({ name: normalized, source_password: sourcePassword, bitrate, codec, protocol, description, genre })
      .then((m) => { onCreated(adaptApiMount(m)); toast.success(`Mount ${normalized} created`); setOpen(false); reset() })
      .catch((err) => toast.error(`Create failed: ${err.message}`))
      .finally(() => setLoading(false))
  }

  const inputCls = "h-8 w-full bg-ink-950 border border-ink-800 rounded-md px-3 text-[12.5px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="h-9 px-3.5 bg-k-500 hover:bg-k-400 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors">
        <Plus className="h-3.5 w-3.5" /> New Mount
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}>
          <div className="w-full max-w-md rounded-lg border border-ink-800 bg-ink-900 p-5 space-y-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-100">New Mount</h2>
              <p className="text-[12px] text-ink-500 mt-0.5">Create a new stream endpoint</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Mount Name *</label>
                <input className={cn(inputCls, "font-mono")} placeholder="/radio1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Source Password *</label>
                <input className={inputCls} type="password" placeholder="min 8 characters" value={sourcePassword} onChange={(e) => setSourcePassword(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Codec</label>
                  <Select value={codec} onValueChange={setCodec}>
                    <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="AAC">AAC</SelectItem><SelectItem value="MP3">MP3</SelectItem><SelectItem value="Opus">Opus</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Bitrate</label>
                  <Select value={bitrate} onValueChange={setBitrate}>
                    <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["64k","96k","128k","192k","256k"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Protocol</label>
                <Select value={protocol} onValueChange={setProtocol}>
                  <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HLS">HLS — standard latency (6–15s)</SelectItem>
                    <SelectItem value="LL-HLS">LL-HLS — low latency (1–3s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Description</label>
                <input className={inputCls} placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-ink-500 font-mono">Genre</label>
                <input className={inputCls} placeholder="Optional" value={genre} onChange={(e) => setGenre(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setOpen(false); reset() }} className="h-9 px-4 rounded-md border border-ink-800 hover:bg-ink-800 text-[13px] text-ink-200 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={!name || sourcePassword.length < 8 || loading}
                className="h-9 px-4 bg-k-500 hover:bg-k-400 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors">
                {loading ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Page ──

export default function MountsPage() {
  const router = useRouter()
  const [mounts, setMounts]             = React.useState<Mount[]>([])
  const [loading, setLoading]           = React.useState(true)
  const [search, setSearch]             = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<"all" | "live" | "idle">("all")

  React.useEffect(() => {
    api.mounts.list()
      .then((ms) => setMounts(ms.map(adaptApiMount)))
      .catch((err) => toast.error(`Failed to load mounts: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  const filtered = mounts.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== "all" && m.status !== statusFilter) return false
    return true
  })

  const liveCount = mounts.filter((m) => m.status === "live").length
  const idleCount = mounts.filter((m) => m.status !== "live").length

  const toSlug = (name: string) => name.replace(/^\/+/, "")

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Mounts</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {mounts.length} mount{mounts.length !== 1 ? "s" : ""} · {liveCount} live · stream endpoints &amp; source connections
          </p>
        </div>
        <CreateMountDialog onCreated={(m) => setMounts((prev) => [m, ...prev])} />
      </div>

      {/* Filters */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500 h-3.5 w-3.5" />
          <input
            className="h-8 w-full bg-transparent border border-ink-800 rounded-md pl-8 pr-3 text-[12px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
            placeholder="Search mounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex bg-ink-900 border border-ink-800 rounded-md p-0.5 text-[12px]">
          {(["all", "live", "idle"] as const).map((f) => {
            const count = f === "all" ? mounts.length : f === "live" ? liveCount : idleCount
            return (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={cn("px-2.5 py-1 rounded capitalize transition-colors",
                  statusFilter === f ? "bg-ink-800 text-ink-100 font-medium" : "text-ink-400 hover:text-ink-200"
                )}>
                {f} <span className="text-ink-500 ml-1">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="mt-5 border-t border-ink-800">
        <div className="grid grid-cols-[minmax(0,1.4fr)_80px_140px_minmax(0,1fr)_60px_64px] gap-3 px-1 py-2 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono border-b border-ink-800">
          <div>Mount</div><div>Protocol</div><div>Codec / Bitrate</div>
          <div>Activity</div><div className="text-right">Lsnr</div><div />
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center gap-2 text-ink-500">
            <div className="h-8 w-8 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
            <p className="text-[12px] font-mono mt-1">Loading mounts…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-ink-500">
            <p className="text-[12.5px]">{mounts.length === 0 ? "No mounts yet — click \"New Mount\" above" : "No mounts match your filters"}</p>
          </div>
        ) : (
          filtered.map((mount) => (
            <div
              key={mount.id}
              className="kast-row grid grid-cols-[minmax(0,1.4fr)_80px_140px_minmax(0,1fr)_60px_64px] gap-3 px-1 py-3 items-center border-b border-ink-800/60 cursor-pointer"
              onClick={() => router.push(`/mounts/${toSlug(mount.name)}`)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <PulseDot status={mount.status} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13.5px] text-ink-100 truncate">{mount.name}</span>
                    {mount.protocol === "LL-HLS" && (
                      <span className="text-[9.5px] px-1.5 py-px rounded bg-k-500/10 border border-k-500/30 text-k-300 font-mono shrink-0">low-latency</span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-500 font-mono mt-0.5">created {mount.created}</div>
                </div>
              </div>
              <span className={cn("text-[11px] font-mono", mount.protocol === "LL-HLS" ? "text-k-400" : "text-ink-300")}>
                {mount.protocol}
              </span>
              <span className="text-[12px] font-mono text-ink-300">
                {[mount.codec, mount.bitrate].filter(Boolean).join(" · ") || "—"}
              </span>
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-6">
                <path d="M0,18 L10,16 L20,17 L30,14 L40,12 L50,13 L60,10 L70,8 L80,6 L90,5 L100,4" fill="none" stroke="#fb7314" strokeWidth="1.2"/>
              </svg>
              <span className="text-right text-[12.5px] font-mono text-ink-100">{mount.listeners}</span>
              <div className="row-actions flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <KBtn title="Copy HLS URL" onClick={() => {
                  const base = `${window.location.protocol}//${window.location.hostname}:8080`
                  navigator.clipboard.writeText(`${base}/hls/${toSlug(mount.name)}/index.m3u8`)
                  toast.success("Copied")
                }}>
                  <Copy className="h-3 w-3" />
                </KBtn>
                <KBtn onClick={() => router.push(`/mounts/${toSlug(mount.name)}`)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </KBtn>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
