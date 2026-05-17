"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Copy, Music2, SkipForward, Users, Palette, Plus } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  api, type APINowPlaying, type PlayerConfigBody,
  type APIPlaylist, type APIAutoDJSession, type APIAutoDJTracks,
  type APIAutoDJTrackInfo, type APIListener,
} from "@/lib/api"
import { type Mount, adaptApiMount, PulseDot, KBtn } from "../page"

// ── Helpers ──

function streamBaseUrl(): string {
  if (typeof window === "undefined") return ""
  return process.env.NEXT_PUBLIC_STREAM_URL
    ?? `${window.location.protocol}//${window.location.hostname}:8080`
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] uppercase tracking-wider text-ink-500 font-mono font-medium mb-1.5">
      {children}
    </p>
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

// ── Listener helpers (shared with listeners page) ──

function isPrivate(ip: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1$|^fd|^fc)/.test(ip)
}
function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ""
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("")
}
function countryName(code: string): string {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code } catch { return code }
}
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 5)  return "just now"
  if (diff < 60) return `${diff}s ago`
  return `${Math.floor(diff / 60)}m ago`
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

function fmtDuration(ms: number): string {
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`
}

// ── Tabs ──

function MountInfoTab({ mount, nowPlaying, onRefreshNowPlaying, history }: {
  mount: Mount; nowPlaying: APINowPlaying; onRefreshNowPlaying: () => void; history: APIAutoDJTrackInfo[]
}) {
  const base = streamBaseUrl().replace(/\/$/, "")
  const slug = mount.name.replace(/^\/+/, "")

  return (
    <div className="space-y-5">
      {/* Now Playing */}
      <div>
        <SectionLabel>Now Playing</SectionLabel>
        <div className="rounded-md border border-ink-800 bg-ink-950/40 px-3 py-3">
          <div className="flex items-center justify-between">
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
              <span className="text-ink-200 font-mono truncate max-w-[300px]">{v}</span>
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

      {/* Recently Played */}
      {history.length > 0 && (
        <>
          <div className="border-t border-ink-800" />
          <div>
            <SectionLabel>Recently Played</SectionLabel>
            <div className="space-y-1">
              {history.map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md border border-ink-800 bg-ink-950/30">
                  <span className="text-[11px] font-mono text-ink-600 w-4 shrink-0 text-right">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink-200">{t.title || "Unknown"}</p>
                    <p className="truncate text-[11px] text-ink-500">{t.artist || "—"}</p>
                  </div>
                  {t.duration_ms > 0 && (
                    <span className="text-[10.5px] font-mono text-ink-600 shrink-0">{fmtDuration(t.duration_ms)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MountListenersTab({ mount }: { mount: Mount }) {
  const [listeners, setListeners] = React.useState<APIListener[] | null>(null)

  React.useEffect(() => {
    const load = () =>
      api.listeners.list()
        .then((all) => setListeners(all.filter((l) => l.mount === mount.name)))
        .catch(() => {})
    load()
    const id = setInterval(load, 5_000)
    return () => clearInterval(id)
  }, [mount.name])

  const count = listeners?.length ?? mount.listeners

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-mono text-ink-300">
          <Users className="h-3.5 w-3.5 text-ink-500" />
          {count} listener{count !== 1 ? "s" : ""} connected
        </span>
      </div>

      {listeners === null ? (
        <div className="py-10 flex items-center justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
        </div>
      ) : listeners.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-ink-500">
          <Users className="h-8 w-8 opacity-20" />
          <p className="text-[12px]">No active listeners on this mount</p>
        </div>
      ) : (
        <div className="border-t border-ink-800">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_80px_60px] gap-3 px-1 py-2 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono border-b border-ink-800">
            <div>IP</div><div>Location</div><div>Client</div><div className="text-right">Seen</div>
          </div>
          {listeners.map((l, i) => (
            <div key={`${l.ip}-${i}`}
              className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_80px_60px] gap-3 px-1 py-3 items-center border-b border-ink-800/60 last:border-0">
              <span className="font-mono text-[12.5px] text-ink-100 truncate">{l.ip}</span>
              <span className="text-[12px] font-mono truncate">
                {isPrivate(l.ip)
                  ? <span className="text-ink-500">Local</span>
                  : l.country_code
                    ? <span className="flex items-center gap-1.5"><span>{countryFlag(l.country_code)}</span><span className="text-ink-300">{countryName(l.country_code)}</span></span>
                    : <span className="text-ink-600">—</span>
                }
              </span>
              <span className="font-mono text-[11.5px] text-ink-400 truncate" title={l.user_agent || undefined}>{parseUA(l.user_agent)}</span>
              <span className="text-right text-[11px] text-ink-500 font-mono">{timeAgo(l.last_seen)}</span>
            </div>
          ))}
        </div>
      )}
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
  const [stationName, setStationName]     = React.useState(mount.playerStationName)
  const [accent, setAccent]               = React.useState(mount.playerAccent)
  const [accentSoft, setAccentSoft]       = React.useState(mount.playerAccentSoft)
  const [theme, setTheme]                 = React.useState<"dark" | "light">(mount.playerTheme as "dark" | "light" || "dark")
  const [layout, setLayout]               = React.useState<"split" | "centered">(mount.playerLayout as "split" | "centered" || "split")
  const [ambient, setAmbient]             = React.useState(mount.playerAmbient)
  const [showAbout, setShowAbout]         = React.useState(mount.playerShowAbout)
  const [showHistory, setShowHistory]     = React.useState(mount.playerShowHistory)
  const [showPlaylist, setShowPlaylist]   = React.useState(mount.playerShowPlaylist)
  const [saving, setSaving]               = React.useState(false)

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
    <div className="space-y-5">
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
  const [trackData, setTrackData]               = React.useState<APIAutoDJTracks | null>(null)
  const nowPlayingRowRef                        = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    Promise.all([api.playlists.list(), api.mounts.autoDJStatus(mount.name).catch(() => null)])
      .then(([pls, sess]) => { setPlaylists(pls); setSession(sess); if (sess) setSelectedPlaylist(sess.playlist_id) })
      .finally(() => setLoading(false))
  }, [mount.name])

  const isRunning      = !!session
  const activePlaylist = playlists.find((p) => p.id === session?.playlist_id)

  React.useEffect(() => {
    if (!isRunning) { setTrackData(null); return }
    const load = () => api.mounts.autoDJTracks(mount.name).then(setTrackData).catch(() => {})
    load()
    const id = setInterval(load, 5_000)
    return () => clearInterval(id)
  }, [isRunning, mount.name])

  React.useEffect(() => {
    if (nowPlayingRowRef.current) {
      nowPlayingRowRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [trackData?.now_playing_id])

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
    <div className="space-y-5">
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

      {/* Playlist browser */}
      {isRunning && trackData && trackData.tracks.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel>Playlist ({trackData.tracks.length} tracks)</SectionLabel>
          <div className="rounded-md border border-ink-800 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {trackData.tracks.map((t, i) => {
                const isNow = t.id === trackData.now_playing_id
                return (
                  <div
                    key={t.id + i}
                    ref={isNow ? nowPlayingRowRef : null}
                    className={cn(
                      "group relative flex items-center gap-2 px-3 py-2 border-b border-ink-800/50 last:border-0",
                      isNow ? "bg-k-500/10" : "hover:bg-ink-800/40"
                    )}
                  >
                    <span className={cn("text-[10.5px] font-mono w-5 shrink-0 text-right", isNow ? "text-k-400" : "text-ink-600")}>
                      {isNow ? <Music2 className="h-3 w-3 text-k-400 inline" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("truncate text-[12px]", isNow ? "text-k-300 font-medium" : "text-ink-200")}>{t.title || "Unknown"}</p>
                      <p className="truncate text-[10.5px] text-ink-500">{t.artist || "—"}</p>
                    </div>
                    {t.duration_ms > 0 && (
                      <span className="text-[10.5px] font-mono text-ink-600 shrink-0 group-hover:opacity-0 transition-opacity">
                        {fmtDuration(t.duration_ms)}
                      </span>
                    )}
                    <div className="absolute right-2 inset-y-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        title="Jump to this track"
                        onClick={() =>
                          api.mounts.jumpToTrack(mount.name, i)
                            .then(() => {
                              toast.success(`Jumping to "${t.title || "track"}"`)
                              setTimeout(() => api.mounts.autoDJTracks(mount.name).then(setTrackData).catch(() => {}), 700)
                            })
                            .catch((err) => toast.error(`Jump failed: ${err.message}`))
                        }
                        className="h-6 px-2 rounded bg-ink-700 hover:bg-k-500 text-ink-200 text-[11px] font-mono flex items-center gap-1 transition-colors"
                      >
                        <SkipForward className="h-3 w-3" /> Jump
                      </button>
                      <button
                        title="Play after current track"
                        onClick={() =>
                          api.mounts.insertNext(mount.name, t.id)
                            .then(() => {
                              toast.success(`Queued "${t.title || "track"}"`)
                              api.mounts.autoDJTracks(mount.name).then(setTrackData).catch(() => {})
                            })
                            .catch((err) => toast.error(`Queue failed: ${err.message}`))
                        }
                        className="h-6 px-2 rounded bg-ink-700 hover:bg-ink-600 text-ink-200 text-[11px] font-mono flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Next
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* One-shot queue */}
          {trackData.queue.length > 0 && (
            <div className="mt-1">
              <p className="text-[10.5px] uppercase tracking-wider text-ink-500 font-mono mb-1">Up Next (one-shot)</p>
              <div className="rounded-md border border-ink-800/60 bg-ink-950/30 divide-y divide-ink-800/40">
                {trackData.queue.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-[10.5px] font-mono text-ink-600 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[11.5px] text-ink-300">{t.title || "Unknown"}</p>
                      <p className="truncate text-[10.5px] text-ink-500">{t.artist || "—"}</p>
                    </div>
                    {t.duration_ms > 0 && (
                      <span className="text-[10.5px] font-mono text-ink-600 shrink-0">{fmtDuration(t.duration_ms)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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

function MountDangerTab({ mount, onDeleted }: { mount: Mount; onDeleted: () => void }) {
  return (
    <div>
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
                    .then(() => { toast.success(`Mount ${mount.name} deleted`); onDeleted() })
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

// ── Page ──

export default function MountDetailPage() {
  const params = useParams<{ name: string }>()
  const router = useRouter()
  const mountName = "/" + params.name

  const [mount, setMount]           = React.useState<Mount | null>(null)
  const [nowPlaying, setNowPlaying] = React.useState<APINowPlaying>(null)
  const [history, setHistory]       = React.useState<APIAutoDJTrackInfo[]>([])
  const [loading, setLoading]       = React.useState(true)
  const [error, setError]           = React.useState<string | null>(null)

  React.useEffect(() => {
    api.mounts.get(mountName)
      .then((m) => setMount(adaptApiMount(m)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [mountName])

  React.useEffect(() => {
    if (!mount) return
    const load = () => api.mounts.nowPlaying(mount.name).then(setNowPlaying).catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [mount?.name])

  React.useEffect(() => {
    if (!mount) return
    const load = () => api.mounts.autoDJHistory(mount.name).then(setHistory).catch(() => {})
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [mount?.name])

  return (
    <div>
      {/* Back nav */}
      <button
        onClick={() => router.push("/mounts")}
        className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-ink-500 hover:text-ink-200 font-mono transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Mounts
      </button>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12.5px] text-red-400">
          {error}
        </div>
      )}

      {mount && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[24px] font-bold tracking-tight text-ink-100 font-mono">{mount.name}</h1>
                <span className={cn(
                  "text-[11px] font-mono px-2 py-0.5 rounded border",
                  mount.status === "live"  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                  mount.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-400" :
                  "border-ink-700 text-ink-500"
                )}>
                  {mount.status}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-400 font-mono">
                {mount.protocol} · {mount.codec} · {mount.bitrate}
                {mount.listeners > 0 && <span className="text-emerald-400 ml-3">{mount.listeners} listening</span>}
              </p>
            </div>
            <PulseDot status={mount.status} />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="info">
            <TabsList variant="line" className="w-full justify-start border-b border-ink-800 bg-transparent mb-6">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="autodj">AutoDJ</TabsTrigger>
              <TabsTrigger value="player">Player</TabsTrigger>
              <TabsTrigger value="listeners">
                Listeners
                {mount.listeners > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-4 px-1.5 rounded bg-ink-800 text-[10px] font-mono text-ink-300">
                    {mount.listeners}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="danger" className="text-red-400/70 data-[state=active]:text-red-400">Danger</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <MountInfoTab
                mount={mount}
                nowPlaying={nowPlaying}
                onRefreshNowPlaying={() => api.mounts.nowPlaying(mount.name).then(setNowPlaying).catch(() => {})}
                history={history}
              />
            </TabsContent>
            <TabsContent value="autodj">
              <MountAutoDJTab mount={mount} />
            </TabsContent>
            <TabsContent value="player">
              <MountPlayerTab
                mount={mount}
                onUpdated={(patch) => setMount((m) => m ? { ...m, ...patch } : m)}
              />
            </TabsContent>
            <TabsContent value="listeners">
              <MountListenersTab mount={mount} />
            </TabsContent>
            <TabsContent value="danger">
              <MountDangerTab mount={mount} onDeleted={() => router.push("/mounts")} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
