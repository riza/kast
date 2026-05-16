"use client"

import * as React from "react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import {
  Plus,
  Search,
  Copy,
  Trash2,
  Radio,
  SkipForward,
  Music2,
  Users,
  Palette,
} from "lucide-react"
import { toast } from "sonner"
import { api, type APIMount, type APINowPlaying, type PlayerConfigBody } from "@/lib/api"

// ── Types ──

type Mount = {
  id:                  string
  name:                string
  protocol:            string
  codec:               string
  bitrate:             string
  listeners:           number
  status:              "idle" | "live" | "error"
  created:             string
  description:         string
  genre:               string
  website:             string
  playerStationName:   string
  playerAccent:        string
  playerAccentSoft:    string
  playerTheme:         string
  playerLayout:        string
  playerAmbient:       boolean
  playerShowAbout:     boolean
  playerShowHistory:   boolean
  playerShowPlaylist:  boolean
}

function adaptApiMount(m: APIMount): Mount {
  return {
    id:               m.id,
    name:             m.name,
    protocol:         m.protocol || "HLS",
    codec:            m.codec    || "AAC",
    bitrate:          m.bitrate  || "128k",
    listeners:        m.listeners,
    status:           m.status as Mount["status"],
    created:          m.created_at.slice(0, 10),
    description:      m.description,
    genre:            m.genre,
    website:          m.website,
    playerStationName:  m.player_station_name  ?? "",
    playerAccent:       m.player_accent        ?? "#E85D2F",
    playerAccentSoft:   m.player_accent_soft   ?? "rgba(232,93,47,0.16)",
    playerTheme:        m.player_theme         ?? "dark",
    playerLayout:       m.player_layout        ?? "split",
    playerAmbient:      m.player_ambient       ?? true,
    playerShowAbout:    m.player_show_about    ?? true,
    playerShowHistory:  m.player_show_history  ?? true,
    playerShowPlaylist: m.player_show_playlist ?? true,
  }
}

// ── Helpers ──

function StatusBadge({ status }: { status: Mount["status"] }) {
  if (status === "live")
    return <Badge className="border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400">Live</Badge>
  if (status === "idle")
    return <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">Idle</Badge>
  return <Badge className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">Error</Badge>
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(value)
          toast.success("Copied to clipboard")
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  )
}

function apiBaseUrl(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("kast_api_url") ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"
}

// ── Mount Drawer Tabs ──

function MountInfoTab({ mount, nowPlaying, onRefreshNowPlaying }: { mount: Mount; nowPlaying: APINowPlaying; onRefreshNowPlaying: () => void }) {
  const base = apiBaseUrl().replace(/\/$/, "")
  const slug = mount.name.replace(/^\/+/, "")
  return (
    <div className="space-y-4 p-4">
      {/* Now Playing */}
      <div className="rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Now Playing</p>
          {nowPlaying && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() =>
                api.mounts.skipTrack(mount.name)
                  .then(() => {
                    toast.success("Skipped to next track")
                    // Poll a couple of times quickly so the new track shows up fast.
                    setTimeout(onRefreshNowPlaying, 300)
                    setTimeout(onRefreshNowPlaying, 1200)
                  })
                  .catch((err) => toast.error(`Skip failed: ${err.message}`))
              }
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </Button>
          )}
        </div>
        {nowPlaying ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Music2 className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{nowPlaying.title || "Unknown"}</p>
                <p className="truncate text-xs text-muted-foreground">{nowPlaying.artist || "Unknown"}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing playing — start AutoDJ from the Playlists page</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadata</p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Name</span><span className="font-mono">{mount.name}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Description</span><span>{mount.description || "—"}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Genre</span><span>{mount.genre || "—"}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Website</span><span className="truncate max-w-[160px]">{mount.website || "—"}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Created</span><span>{mount.created}</span></div>
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audio</p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Codec</span><span>{mount.codec}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Bitrate</span><span>{mount.bitrate}</span></div>
          <div className="flex justify-between text-xs"><span className="text-muted-foreground">Protocol</span><span>{mount.protocol}</span></div>
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endpoint URLs</p>
        <div className="space-y-2">
          <CopyRow label="Public player" value={`${typeof window !== "undefined" ? window.location.origin : ""}/listen/${slug}`} />
          <CopyRow label="HLS playlist" value={`${base}/hls/${slug}/index.m3u8`} />
          <CopyRow label="Source input (Icecast PUT)" value={`${base}/source/${slug}`} />
        </div>
      </div>
    </div>
  )
}

function MountListenersTab({ mount }: { mount: Mount }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{mount.listeners} listener{mount.listeners !== 1 ? "s" : ""}</Badge>
      </div>
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Users className="h-8 w-8 opacity-30" />
        <p className="text-xs">Per-listener tracking not yet available</p>
        <p className="text-[10px]">Only total connection count is reported by the server</p>
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

function MountPlayerTab({
  mount,
  onUpdated,
}: {
  mount: Mount
  onUpdated: (patch: Partial<Mount>) => void
}) {
  const [stationName, setStationName] = React.useState(mount.playerStationName)
  const [accent,      setAccent]      = React.useState(mount.playerAccent)
  const [accentSoft,  setAccentSoft]  = React.useState(mount.playerAccentSoft)
  const [theme,       setTheme]       = React.useState<"dark" | "light">(mount.playerTheme as "dark" | "light" || "dark")
  const [layout,      setLayout]      = React.useState<"split" | "centered">(mount.playerLayout as "split" | "centered" || "split")
  const [ambient,     setAmbient]     = React.useState(mount.playerAmbient)
  const [showAbout,   setShowAbout]   = React.useState(mount.playerShowAbout)
  const [showHistory,   setShowHistory]   = React.useState(mount.playerShowHistory)
  const [showPlaylist,  setShowPlaylist]  = React.useState(mount.playerShowPlaylist)
  const [saving,      setSaving]      = React.useState(false)

  const slug = mount.name.replace(/^\/+/, "")
  const playerUrl = typeof window !== "undefined"
    ? `${window.location.origin}/listen/${slug}`
    : `/listen/${slug}`

  const handleSave = () => {
    setSaving(true)
    const body: PlayerConfigBody = {
      player_station_name:  stationName,
      player_accent:        accent,
      player_accent_soft:   accentSoft,
      player_theme:         theme,
      player_layout:        layout,
      player_ambient:       ambient,
      player_show_about:    showAbout,
      player_show_history:  showHistory,
      player_show_playlist: showPlaylist,
    }
    api.mounts.updatePlayerConfig(mount.name, body)
      .then(() => {
        toast.success("Player settings saved")
        onUpdated({
          playerStationName:  stationName,
          playerAccent:       accent,
          playerAccentSoft:   accentSoft,
          playerTheme:        theme,
          playerLayout:       layout,
          playerAmbient:      ambient,
          playerShowAbout:    showAbout,
          playerShowHistory:  showHistory,
          playerShowPlaylist: showPlaylist,
        })
      })
      .catch((err) => toast.error(`Save failed: ${err.message}`))
      .finally(() => setSaving(false))
  }

  return (
    <div className="space-y-5 p-4">
      {/* Preview link */}
      <div className="flex items-center gap-2 rounded border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Public Player URL</p>
          <p className="truncate font-mono text-xs">{playerUrl}</p>
        </div>
        <Button
          variant="ghost" size="sm" className="h-7 shrink-0 gap-1 text-xs"
          onClick={() => window.open(playerUrl, "_blank")}
        >
          Open ↗
        </Button>
      </div>

      {/* Station name */}
      <div className="space-y-1.5">
        <Label className="text-xs">Display Name</Label>
        <Input
          placeholder={`e.g. ${slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`}
          value={stationName}
          onChange={(e) => setStationName(e.target.value)}
          className="text-sm"
        />
        <p className="text-[11px] text-muted-foreground">Leave empty to use the mount slug</p>
      </div>

      {/* Theme */}
      <div className="space-y-1.5">
        <Label className="text-xs">Theme</Label>
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 rounded border py-1.5 text-xs capitalize transition-colors ${
                theme === t ? "border-foreground bg-foreground/5 font-medium" : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div className="space-y-1.5">
        <Label className="text-xs">Layout</Label>
        <div className="flex gap-2">
          {(["split", "centered"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`flex-1 rounded border py-1.5 text-xs capitalize transition-colors ${
                layout === l ? "border-foreground bg-foreground/5 font-medium" : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div className="space-y-1.5">
        <Label className="text-xs">Accent Color</Label>
        <div className="grid grid-cols-8 gap-1.5">
          {ACCENT_OPTIONS.map((c) => (
            <button
              key={c.value}
              onClick={() => { setAccent(c.value); setAccentSoft(c.soft) }}
              title={c.name}
              className="aspect-square rounded transition-transform hover:scale-110"
              style={{
                background: c.value,
                outline: accent === c.value ? `2px solid ${c.value}` : "none",
                outlineOffset: "2px",
              }}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Current: {accent}</p>
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <Label className="text-xs">Options</Label>
        {[
          { label: "Ambient glow",          value: ambient,      set: setAmbient },
          { label: "Show about section",    value: showAbout,    set: setShowAbout },
          { label: "Show recently played",  value: showHistory,  set: setShowHistory },
          { label: "Show playlist",         value: showPlaylist, set: setShowPlaylist },
        ].map(({ label, value, set }) => (
          <div key={label} className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm">{label}</span>
            <button
              onClick={() => set(!value)}
              className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${value ? "left-[18px]" : "left-0.5"}`}
              />
            </button>
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Palette className="mr-2 h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save Player Settings"}
      </Button>
    </div>
  )
}

function MountDangerTab({ mount, onClose, onDelete }: { mount: Mount; onClose: () => void; onDelete: (name: string) => void }) {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">Delete Mount</p>
            <p className="text-xs text-muted-foreground">Remove mount configuration permanently</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">Delete</Button>
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
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    api.mounts.delete(mount.name)
                      .then(() => {
                        onDelete(mount.name)
                        onClose()
                        toast.success(`Mount ${mount.name} deleted`)
                      })
                      .catch((err) => toast.error(`Delete failed: ${err.message}`))
                  }}
                >
                  Delete
                </AlertDialogAction>
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
  const [description, setDescription]       = React.useState("")
  const [genre, setGenre]                   = React.useState("")
  const [loading, setLoading]               = React.useState(false)

  const reset = () => {
    setName(""); setSourcePassword(""); setDescription(""); setGenre("")
    setBitrate("128k"); setCodec("AAC")
  }

  const handleCreate = () => {
    if (!name.trim() || sourcePassword.length < 8) return
    setLoading(true)
    const normalized = name.startsWith("/") ? name : "/" + name
    api.mounts.create({
      name:            normalized,
      source_password: sourcePassword,
      bitrate, codec, description, genre,
    })
      .then((m) => {
        onCreated(adaptApiMount(m))
        toast.success(`Mount ${normalized} created`)
        setOpen(false); reset()
      })
      .catch((err) => toast.error(`Create failed: ${err.message}`))
      .finally(() => setLoading(false))
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        New Mount
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}
        >
          <div className="w-full max-w-md rounded border bg-background p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">New Mount</h2>
              <p className="text-sm text-muted-foreground">Create a new stream endpoint</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Mount Name *</Label>
                <Input placeholder="/radio1" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label>Source Password *</Label>
                <Input type="password" placeholder="min 8 characters" value={sourcePassword} onChange={(e) => setSourcePassword(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Codec</Label>
                  <Select value={codec} onValueChange={setCodec}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AAC">AAC</SelectItem>
                      <SelectItem value="MP3">MP3</SelectItem>
                      <SelectItem value="Opus">Opus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Bitrate</Label>
                  <Select value={bitrate} onValueChange={setBitrate}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="64k">64k</SelectItem>
                      <SelectItem value="96k">96k</SelectItem>
                      <SelectItem value="128k">128k</SelectItem>
                      <SelectItem value="192k">192k</SelectItem>
                      <SelectItem value="256k">256k</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Genre</Label>
                <Input placeholder="Optional" value={genre} onChange={(e) => setGenre(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setOpen(false); reset() }}>Cancel</Button>
              <Button
                disabled={!name || sourcePassword.length < 8 || loading}
                onClick={handleCreate}
              >
                {loading ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Page ──

export default function MountsPage() {
  const [mounts, setMounts]             = React.useState<Mount[]>([])
  const [loading, setLoading]           = React.useState(true)
  const [search, setSearch]             = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [selectedMount, setSelectedMount] = React.useState<Mount | null>(null)
  const [nowPlaying, setNowPlaying]       = React.useState<APINowPlaying>(null)

  React.useEffect(() => {
    api.mounts.list()
      .then((ms) => setMounts(ms.map(adaptApiMount)))
      .catch((err) => toast.error(`Failed to load mounts: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  // Poll now-playing for the selected mount every 5 s.
  React.useEffect(() => {
    setNowPlaying(null)
    if (!selectedMount) return
    const load = () =>
      api.mounts.nowPlaying(selectedMount.name)
        .then(setNowPlaying)
        .catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [selectedMount?.name])

  const filtered = mounts.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== "all" && m.status !== statusFilter) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Mounts</h1>
          <p className="text-sm text-muted-foreground">
            Stream endpoints and source connections
          </p>
        </div>
        <CreateMountDialog onCreated={(m) => setMounts((prev) => [m, ...prev])} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search mounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="idle">Idle</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Radio className="h-10 w-10 opacity-20 animate-pulse" />
              <p className="text-sm">Loading mounts…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Radio className="h-10 w-10 opacity-20" />
              <p className="text-sm">{mounts.length === 0 ? "No mounts yet — click \"New Mount\" above" : "No mounts match your filters"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mount Name</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Codec</TableHead>
                  <TableHead>Bitrate</TableHead>
                  <TableHead className="text-right">Listeners</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((mount) => (
                  <TableRow
                    key={mount.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedMount(mount)}
                  >
                    <TableCell className="font-mono text-xs font-medium">{mount.name}</TableCell>
                    <TableCell><Badge variant="outline">{mount.protocol}</Badge></TableCell>
                    <TableCell>{mount.codec}</TableCell>
                    <TableCell>{mount.bitrate}</TableCell>
                    <TableCell className="text-right">{mount.listeners}</TableCell>
                    <TableCell><StatusBadge status={mount.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{mount.created}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mount Detail Sheet */}
      <Sheet
        open={selectedMount !== null}
        onOpenChange={(open) => !open && setSelectedMount(null)}
      >
        <SheetContent
          side="right"
          className="w-[480px] sm:max-w-[480px] p-0 flex flex-col"
        >
          {selectedMount && (
            <>
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="font-mono">{selectedMount.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2">
                  <StatusBadge status={selectedMount.status} />
                  <span>{selectedMount.protocol} · {selectedMount.codec} · {selectedMount.bitrate}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="info">
                  <TabsList variant="line" className="w-full justify-start border-b px-4">
                    <TabsTrigger value="info">Info</TabsTrigger>
                    <TabsTrigger value="player">Player</TabsTrigger>
                    <TabsTrigger value="listeners">
                      Listeners
                      {selectedMount.listeners > 0 && (
                        <Badge variant="secondary" className="ml-1 text-[10px]">
                          {selectedMount.listeners}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="danger" className="text-destructive">Danger</TabsTrigger>
                  </TabsList>

                  <TabsContent value="info">
                    <MountInfoTab
                      mount={selectedMount}
                      nowPlaying={nowPlaying}
                      onRefreshNowPlaying={() =>
                        api.mounts.nowPlaying(selectedMount.name)
                          .then(setNowPlaying)
                          .catch(() => {})
                      }
                    />
                  </TabsContent>
                  <TabsContent value="player">
                    <MountPlayerTab
                      mount={selectedMount}
                      onUpdated={(patch) => {
                        setSelectedMount((m) => m ? { ...m, ...patch } : m)
                        setMounts((prev) => prev.map((m) => m.name === selectedMount.name ? { ...m, ...patch } : m))
                      }}
                    />
                  </TabsContent>
                  <TabsContent value="listeners">
                    <MountListenersTab mount={selectedMount} />
                  </TabsContent>
                  <TabsContent value="danger">
                    <MountDangerTab
                      mount={selectedMount}
                      onClose={() => setSelectedMount(null)}
                      onDelete={(name) => setMounts((prev) => prev.filter((m) => m.name !== name))}
                    />
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
