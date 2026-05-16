"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Search, Copy, SkipForward, Music2, Users, Palette } from "lucide-react"
import { toast } from "sonner"
import {
  api, type APIMount, type APINowPlaying, type PlayerConfigBody,
  type APIPlaylist, type APIAutoDJSession,
} from "@/lib/api"

// ── Types ──

type Mount = {
  id: string; name: string; protocol: string; codec: string; bitrate: string
  listeners: number; status: "idle" | "live" | "error"; created: string
  description: string; genre: string; website: string
  playerStationName: string; playerAccent: string; playerAccentSoft: string
  playerTheme: string; playerLayout: string; playerAmbient: boolean
  playerShowAbout: boolean; playerShowHistory: boolean; playerShowPlaylist: boolean
}

function adaptApiMount(m: APIMount): Mount {
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

function PulseDot({ status }: { status: Mount["status"] }) {
  return (
    <span className={cn(
      "inline-block w-1.5 h-1.5 rounded-full shrink-0",
      status === "live"  ? "bg-emerald-500 pulse-dot" :
      status === "error" ? "bg-red-500" : "bg-ink-600"
    )} />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] uppercase tracking-wider text-ink-500 font-mono font-medium mb-1.5">
      {children}
    </p>
  )
}

function KRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("kast-row flex items-center border-b border-ink-800/60 last:border-0", className)}>
      {children}
    </div>
  )
}

function KBtn({
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

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-ink-800 bg-ink-950/50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-ink-500 font-mono">{label}</p>
        <p className="truncate font-mono text-[11.5px] text-ink-200">{value}</p>
      </div>
      <KBtn
        title="Copy"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied") }}
      >
        <Copy className="h-3 w-3" />
      </KBtn>
    </div>
  )
}

function apiBaseUrl(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("kast_api_url") ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
}

// ── Drawer Tabs ──

function MountInfoTab({ mount, nowPlaying, onRefreshNowPlaying }: {
  mount: Mount; nowPlaying: APINowPlaying; onRefreshNowPlaying: () => void
}) {
  const base = apiBaseUrl().replace(/\/$/, "")
  const slug = mount.name.replace(/^\/+/, "")

  return (
    <div className="p-5 space-y-5">
      {/* Now Playing */}
      <div>
        <SectionLabel>Now Playing</SectionLabel>
        <div className="rounded-md border border-ink-800 bg-ink-950/40 px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            {nowPlaying ? (
              <div className="flex items-center gap-2 min-w-0">
                <Music2 className="h-3.5 w-3.5 shrink-0 text-k-400" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink-100">{nowPlaying.title || "Unknown"}</p>
                  <p className="truncate text-[11px] text-ink-500">{nowPlaying.artist || "Unknown"}</p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-ink-500">Nothing playing — start AutoDJ</p>
            )}
            {nowPlaying && (
              <button
                className="h-7 px-2.5 rounded-md bg-ink-800 hover:bg-ink-700 text-[11.5px] text-ink-200 inline-flex items-center gap-1.5 transition-colors shrink-0 ml-2"
                onClick={() =>
                  api.mounts.skipTrack(mount.name)
                    .then(() => { toast.success("Skipped"); setTimeout(onRefreshNowPlaying, 300); setTimeout(onRefreshNowPlaying, 1200) })
                    .catch((err) => toast.error(`Skip failed: ${err.message}`))
                }
              >
                <SkipForward className="h-3 w-3" /> Skip
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div>
        <SectionLabel>Metadata</SectionLabel>
        <div className="space-y-1.5">
          {[
            ["Name", mount.name], ["Description", mount.description || "—"],
            ["Genre", mount.genre || "—"], ["Website", mount.website || "—"],
            ["Created", mount.created],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12px]">
              <span className="text-ink-500">{k}</span>
              <span className="text-ink-200 font-mono truncate max-w-[200px]">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-ink-800" />

      {/* Audio */}
      <div>
        <SectionLabel>Audio</SectionLabel>
        <div className="space-y-1.5">
          {[["Codec", mount.codec], ["Bitrate", mount.bitrate], ["Protocol", mount.protocol]].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12px]">
              <span className="text-ink-500">{k}</span>
              <span className="text-ink-200 font-mono">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-ink-800" />

      {/* URLs */}
      <div>
        <SectionLabel>Endpoint URLs</SectionLabel>
        <div className="space-y-2">
          <CopyRow label="Public player" value={`${typeof window !== "undefined" ? window.location.origin : ""}/listen/${slug}`} />
          <CopyRow label="HLS playlist" value={`${base}/hls/${slug}/index.m3u8`} />
          <CopyRow label="Source input" value={`${base}/source/${slug}`} />
        </div>
      </div>
    </div>
  )
}

function MountListenersTab({ mount }: { mount: Mount }) {
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-mono text-ink-300">
          <Users className="h-3.5 w-3.5 text-ink-500" />
          {mount.listeners} listener{mount.listeners !== 1 ? "s" : ""} connected
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 py-10 text-ink-500">
        <Users className="h-8 w-8 opacity-20" />
        <p className="text-[12px]">Per-listener tracking not available</p>
        <p className="text-[11px] text-ink-600">Only total connection count is reported</p>
      </div>
    </div>
  )
}

const ACCENT_OPTIONS = [
  { name: "Sunset",    value: "#E85D2F", soft: "rgba(232,93,47,0.16)" },
  { name: "Tangerine", value: "#F0A040", soft: "rgba(240,160,64,0.16)" },
  { name: "Forest",    value: "#3D8B5E", soft: "rgba(61,139,94,0.16)" },
  { name: "Cobalt",    value: "#2B6FE0", soft: "rgba(43,111,224,0.16)" },
  { name: "Violet",    value: "#7B5CC7", soft: "rgba(123,92,199,0.16)" },
  { name: "Magenta",   value: "#D4407C", soft: "rgba(212,64,124,0.16)" },
  { name: "Crimson",   value: "#C13C3C", soft: "rgba(193,60,60,0.16)" },
  { name: "Bone",      value: "#D9D2C6", soft: "rgba(217,210,198,0.16)" },
]

function MountPlayerTab({ mount, onUpdated }: { mount: Mount; onUpdated: (patch: Partial<Mount>) => void }) {
  const [stationName, setStationName] = React.useState(mount.playerStationName)
  const [accent, setAccent]           = React.useState(mount.playerAccent)
  const [accentSoft, setAccentSoft]   = React.useState(mount.playerAccentSoft)
  const [theme, setTheme]             = React.useState<"dark" | "light">(mount.playerTheme as "dark" | "light" || "dark")
  const [layout, setLayout]           = React.useState<"split" | "centered">(mount.playerLayout as "split" | "centered" || "split")
  const [ambient, setAmbient]         = React.useState(mount.playerAmbient)
  const [showAbout, setShowAbout]     = React.useState(mount.playerShowAbout)
  const [showHistory, setShowHistory] = React.useState(mount.playerShowHistory)
  const [showPlaylist, setShowPlaylist] = React.useState(mount.playerShowPlaylist)
  const [saving, setSaving]           = React.useState(false)

  const slug = mount.name.replace(/^\/+/, "")
  const playerUrl = typeof window !== "undefined" ? `${window.location.origin}/listen/${slug}` : `/listen/${slug}`

  const handleSave = () => {
    setSaving(true)
    const body: PlayerConfigBody = {
      player_station_name: stationName, player_accent: accent, player_accent_soft: accentSoft,
      player_theme: theme, player_layout: layout, player_ambient: ambient,
      player_show_about: showAbout, player_show_history: showHistory, player_show_playlist: showPlaylist,
    }
    api.mounts.updatePlayerConfig(mount.name, body)
      .then(() => {
        toast.success("Player settings saved")
        onUpdated({ playerStationName: stationName, playerAccent: accent, playerAccentSoft: accentSoft,
          playerTheme: theme, playerLayout: layout, playerAmbient: ambient,
          playerShowAbout: showAbout, playerShowHistory: showHistory, playerShowPlaylist: showPlaylist })
      })
      .catch((err) => toast.error(`Save failed: ${err.message}`))
      .finally(() => setSaving(false))
  }

  return (
    <div className="p-5 space-y-5">
      {/* Player URL */}
      <div className="flex items-center gap-2 rounded-md border border-ink-800 bg-ink-950/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-ink-500 font-mono">Player URL</p>
          <p className="truncate font-mono text-[11.5px] text-ink-200">{playerUrl}</p>
        </div>
        <button onClick={() => window.open(playerUrl, "_blank")} className="h-7 px-2 rounded-md hover:bg-ink-800 text-[11.5px] text-ink-400 hover:text-ink-200 transition-colors shrink-0">
          Open ↗
        </button>
      </div>

      {/* Station name */}
      <div className="space-y-1.5">
        <SectionLabel>Display Name</SectionLabel>
        <input
          className="h-8 w-full bg-ink-950 border border-ink-800 rounded-md px-3 text-[12.5px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
          placeholder={slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          value={stationName}
          onChange={(e) => setStationName(e.target.value)}
        />
      </div>

      {/* Theme */}
      <div className="space-y-1.5">
        <SectionLabel>Theme</SectionLabel>
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)}
              className={cn("flex-1 rounded-md border py-1.5 text-[12px] capitalize transition-colors",
                theme === t ? "border-ink-300 bg-ink-800 text-ink-100 font-medium" : "border-ink-800 text-ink-500 hover:border-ink-700"
              )}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div className="space-y-1.5">
        <SectionLabel>Layout</SectionLabel>
        <div className="flex gap-2">
          {(["split", "centered"] as const).map((l) => (
            <button key={l} onClick={() => setLayout(l)}
              className={cn("flex-1 rounded-md border py-1.5 text-[12px] capitalize transition-colors",
                layout === l ? "border-ink-300 bg-ink-800 text-ink-100 font-medium" : "border-ink-800 text-ink-500 hover:border-ink-700"
              )}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div className="space-y-1.5">
        <SectionLabel>Accent Color</SectionLabel>
        <div className="grid grid-cols-8 gap-1.5">
          {ACCENT_OPTIONS.map((c) => (
            <button key={c.value} onClick={() => { setAccent(c.value); setAccentSoft(c.soft) }} title={c.name}
              className="aspect-square rounded-md transition-transform hover:scale-110"
              style={{ background: c.value, outline: accent === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}
            />
          ))}
        </div>
        <p className="text-[11px] text-ink-600 font-mono">{accent}</p>
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <SectionLabel>Options</SectionLabel>
        {[
          { label: "Ambient glow",         value: ambient,      set: setAmbient },
          { label: "Show about section",   value: showAbout,    set: setShowAbout },
          { label: "Show recently played", value: showHistory,  set: setShowHistory },
          { label: "Show playlist",        value: showPlaylist, set: setShowPlaylist },
        ].map(({ label, value, set }) => (
          <div key={label} className="flex items-center justify-between rounded-md border border-ink-800 px-3 py-2.5">
            <span className="text-[12.5px] text-ink-200">{label}</span>
            <button onClick={() => set(!value)}
              className={cn("relative h-5 w-9 rounded-full transition-colors", value ? "bg-k-500" : "bg-ink-700")}>
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", value ? "left-[18px]" : "left-0.5")} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave} disabled={saving}
        className="w-full h-9 bg-k-500 hover:bg-k-400 disabled:opacity-50 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
      >
        <Palette className="h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save Player Settings"}
      </button>
    </div>
  )
}

function MountAutoDJTab({ mount }: { mount: Mount }) {
  const [playlists, setPlaylists]               = React.useState<APIPlaylist[]>([])
  const [session, setSession]                   = React.useState<APIAutoDJSession | null>(null)
  const [selectedPlaylist, setSelectedPlaylist] = React.useState("")
  const [mode, setMode]                         = React.useState("shuffle")
  const [loading, setLoading]                   = React.useState(true)
  const [acting, setActing]                     = React.useState(false)

  React.useEffect(() => {
    Promise.all([api.playlists.list(), api.mounts.autoDJStatus(mount.name).catch(() => null)])
      .then(([pls, sess]) => { setPlaylists(pls); setSession(sess); if (sess) setSelectedPlaylist(sess.playlist_id) })
      .finally(() => setLoading(false))
  }, [mount.name])

  const isRunning = !!session
  const activePlaylist = playlists.find((p) => p.id === session?.playlist_id)

  const handleStart = () => {
    if (!selectedPlaylist) return
    setActing(true)
    api.mounts.startAutoDJ(mount.name, { playlist_id: selectedPlaylist, mode })
      .then(() => { setSession({ mount: mount.name, playlist_id: selectedPlaylist }); toast.success("AutoDJ started") })
      .catch((err) => toast.error(`Failed: ${err.message}`))
      .finally(() => setActing(false))
  }

  const handleStop = () => {
    setActing(true)
    api.mounts.stopAutoDJ(mount.name)
      .then(() => { setSession(null); toast.success("AutoDJ stopped") })
      .catch((err) => toast.error(`Failed: ${err.message}`))
      .finally(() => setActing(false))
  }

  const handleRestart = () => {
    if (!selectedPlaylist) return
    setActing(true)
    api.mounts.stopAutoDJ(mount.name).catch(() => {})
      .then(() => api.mounts.startAutoDJ(mount.name, { playlist_id: selectedPlaylist, mode }))
      .then(() => { setSession({ mount: mount.name, playlist_id: selectedPlaylist }); toast.success("AutoDJ restarted") })
      .catch((err) => toast.error(`Failed: ${err.message}`))
      .finally(() => setActing(false))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-[12px] text-ink-500 font-mono">Loading…</div>
  )

  return (
    <div className="p-5 space-y-5">
      {/* Status */}
      <div className="flex items-center justify-between rounded-md border border-ink-800 bg-ink-950/40 px-3 py-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-wider text-ink-500 font-mono mb-1">Status</p>
          {isRunning && activePlaylist && (
            <p className="text-[12px] text-ink-300">
              Playing <span className="text-ink-100 font-medium">{activePlaylist.name}</span> · {mode}
            </p>
          )}
          {!isRunning && <p className="text-[12px] text-ink-500">Not running</p>}
        </div>
        <span className={cn(
          "text-[11px] font-mono px-2 py-0.5 rounded border",
          isRunning ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-ink-700 text-ink-500"
        )}>
          {isRunning ? "Running" : "Stopped"}
        </span>
      </div>

      {/* Playlist */}
      <div className="space-y-1.5">
        <SectionLabel>Playlist</SectionLabel>
        {playlists.length === 0 ? (
          <p className="text-[12px] text-ink-500">No playlists — create one from the Playlists page</p>
        ) : (
          <Select value={selectedPlaylist} onValueChange={setSelectedPlaylist} disabled={acting}>
            <SelectTrigger className="bg-ink-950 border-ink-800 text-ink-100 focus:ring-k-500/30">
              <SelectValue placeholder="Select a playlist…" />
            </SelectTrigger>
            <SelectContent>
              {playlists.map((pl) => (
                <SelectItem key={pl.id} value={pl.id}>
                  {pl.name} <span className="text-ink-500 ml-1 text-xs">{pl.track_paths.length} tracks</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Mode */}
      <div className="space-y-1.5">
        <SectionLabel>Mode</SectionLabel>
        <div className="flex gap-2">
          {(["shuffle", "sequential"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} disabled={acting}
              className={cn("flex-1 rounded-md border py-1.5 text-[12px] capitalize transition-colors",
                mode === m ? "border-ink-300 bg-ink-800 text-ink-100 font-medium" : "border-ink-800 text-ink-500 hover:border-ink-700"
              )}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {isRunning ? (
          <>
            <button onClick={handleStop} disabled={acting}
              className="flex-1 h-9 rounded-md border border-ink-800 hover:bg-ink-800 text-ink-200 text-[13px] font-medium transition-colors disabled:opacity-50">
              Stop
            </button>
            <button onClick={handleRestart} disabled={acting || !selectedPlaylist}
              className="flex-1 h-9 bg-k-500 hover:bg-k-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-50">
              {acting ? "…" : "Restart"}
            </button>
          </>
        ) : (
          <button onClick={handleStart} disabled={acting || !selectedPlaylist}
            className="w-full h-9 bg-k-500 hover:bg-k-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-50">
            {acting ? "Starting…" : "Start AutoDJ"}
          </button>
        )}
      </div>
    </div>
  )
}

function MountDangerTab({ mount, onClose, onDelete }: {
  mount: Mount; onClose: () => void; onDelete: (name: string) => void
}) {
  return (
    <div className="p-5">
      <div className="rounded-md border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-red-400">Delete Mount</p>
            <p className="text-[11.5px] text-ink-500 mt-0.5">Permanently removes mount and disconnects all listeners.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="h-8 px-3 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-[12.5px] font-medium transition-colors shrink-0">
                Delete
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {mount.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the mount and disconnect all listeners.
                  Any running AutoDJ session will also be stopped.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() =>
                  api.mounts.delete(mount.name)
                    .then(() => { onDelete(mount.name); onClose(); toast.success(`Mount ${mount.name} deleted`) })
                    .catch((err) => toast.error(`Delete failed: ${err.message}`))
                }>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
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
  const [mounts, setMounts]               = React.useState<Mount[]>([])
  const [loading, setLoading]             = React.useState(true)
  const [search, setSearch]               = React.useState("")
  const [statusFilter, setStatusFilter]   = React.useState<"all" | "live" | "idle">("all")
  const [selectedMount, setSelectedMount] = React.useState<Mount | null>(null)
  const [nowPlaying, setNowPlaying]       = React.useState<APINowPlaying>(null)

  React.useEffect(() => {
    api.mounts.list()
      .then((ms) => setMounts(ms.map(adaptApiMount)))
      .catch((err) => toast.error(`Failed to load mounts: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    setNowPlaying(null)
    if (!selectedMount) return
    const load = () => api.mounts.nowPlaying(selectedMount.name).then(setNowPlaying).catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [selectedMount?.name])

  const filtered = mounts.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== "all" && m.status !== statusFilter) return false
    return true
  })

  const liveCount = mounts.filter((m) => m.status === "live").length
  const idleCount = mounts.filter((m) => m.status !== "live").length

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
        {/* Header row */}
        <div className="grid grid-cols-[minmax(0,1.4fr)_80px_140px_minmax(0,1fr)_60px_80px] gap-3 px-1 py-2 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono border-b border-ink-800">
          <div>Mount</div><div>Protocol</div><div>Codec / Bitrate</div>
          <div>Activity</div><div className="text-right">Lsnr</div><div className="text-right">Actions</div>
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
              className="kast-row grid grid-cols-[minmax(0,1.4fr)_80px_140px_minmax(0,1fr)_60px_80px] gap-3 px-1 py-3 items-center border-b border-ink-800/60 cursor-pointer"
              onClick={() => setSelectedMount(mount)}
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
              <div className="row-actions flex items-center justify-end gap-0.5">
                <KBtn title="Copy URL" onClick={(e) => { e?.stopPropagation(); navigator.clipboard.writeText(`http://localhost:8080/hls/${mount.name.replace(/^\/+/, "")}/index.m3u8`); toast.success("Copied") }}>
                  <Copy className="h-3 w-3" />
                </KBtn>
                <KBtn onClick={(e) => { e?.stopPropagation(); setSelectedMount(mount) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                  </svg>
                </KBtn>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Mount Detail Sheet */}
      <Sheet open={selectedMount !== null} onOpenChange={(open) => !open && setSelectedMount(null)}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col bg-ink-900 border-l border-ink-800">
          {selectedMount && (
            <>
              <SheetHeader className="border-b border-ink-800 px-5 py-4 shrink-0">
                <SheetTitle className="font-mono text-ink-100">{selectedMount.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    "text-[11px] font-mono px-2 py-0.5 rounded border",
                    selectedMount.status === "live" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                    selectedMount.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-400" :
                    "border-ink-700 text-ink-500"
                  )}>
                    {selectedMount.status}
                  </span>
                  <span className="text-[12px] text-ink-400 font-mono">{selectedMount.protocol} · {selectedMount.codec} · {selectedMount.bitrate}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="info">
                  <TabsList variant="line" className="w-full justify-start border-b border-ink-800 px-5 bg-transparent">
                    <TabsTrigger value="info">Info</TabsTrigger>
                    <TabsTrigger value="autodj">AutoDJ</TabsTrigger>
                    <TabsTrigger value="player">Player</TabsTrigger>
                    <TabsTrigger value="listeners">
                      Listeners
                      {selectedMount.listeners > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center h-4 px-1.5 rounded bg-ink-800 text-[10px] font-mono text-ink-300">
                          {selectedMount.listeners}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="danger" className="text-red-400">Danger</TabsTrigger>
                  </TabsList>
                  <TabsContent value="info">
                    <MountInfoTab mount={selectedMount} nowPlaying={nowPlaying} onRefreshNowPlaying={() => api.mounts.nowPlaying(selectedMount.name).then(setNowPlaying).catch(() => {})} />
                  </TabsContent>
                  <TabsContent value="autodj"><MountAutoDJTab mount={selectedMount} /></TabsContent>
                  <TabsContent value="player">
                    <MountPlayerTab mount={selectedMount} onUpdated={(patch) => {
                      setSelectedMount((m) => m ? { ...m, ...patch } : m)
                      setMounts((prev) => prev.map((m) => m.name === selectedMount.name ? { ...m, ...patch } : m))
                    }} />
                  </TabsContent>
                  <TabsContent value="listeners"><MountListenersTab mount={selectedMount} /></TabsContent>
                  <TabsContent value="danger">
                    <MountDangerTab mount={selectedMount} onClose={() => setSelectedMount(null)}
                      onDelete={(name) => setMounts((prev) => prev.filter((m) => m.name !== name))} />
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
