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
import { Switch } from "@/components/ui/switch"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Plus,
  ListMusic,
  ArrowUp,
  ArrowDown,
  Trash2,
  Shuffle,
  List,
  GripVertical,
  Search,
  Radio,
  Edit,
  Check,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  api,
  type APIPlaylist,
  type APIMount,
  type APITrack,
  type APIAutoDJSession,
} from "@/lib/api"

// ── Types ──

type PlayMode = "sequential" | "shuffle"

type Track = {
  path:        string
  title:       string
  artist:      string
  album:       string
  genre:       string
  duration:    string
  durationSec: number
}

type Playlist = {
  id:            string
  name:          string
  mode:          PlayMode
  assignedMount: string   // client-side only; not persisted server-side
  autoDJ:        boolean  // client-side toggle; mirrors djmanager state
  crossfade:     number
  trackPaths:    string[] // source of truth (sent to server)
}

// ── Helpers ──

function formatMs(ms: number): string {
  const sec = Math.round(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function adaptApiTrack(t: APITrack): Track {
  return {
    path:        t.path,
    title:       t.title  || t.path.split("/").pop()?.replace(/\.[^.]+$/, "") || t.path,
    artist:      t.artist || "Unknown",
    album:       t.album  || "",
    genre:       t.genre  || "",
    duration:    formatMs(t.duration_ms),
    durationSec: Math.round(t.duration_ms / 1000),
  }
}

function adaptApiPlaylist(p: APIPlaylist): Playlist {
  return {
    id:            p.id,
    name:          p.name,
    mode:          (p.mode === "shuffle" ? "shuffle" : "sequential") as PlayMode,
    assignedMount: "",
    autoDJ:        false,
    crossfade:     p.crossfade_ms,
    trackPaths:    p.track_paths ?? [],
  }
}

function totalDuration(tracks: Track[]) {
  const sec = tracks.reduce((sum, t) => sum + t.durationSec, 0)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function ModeBadge({ mode }: { mode: PlayMode }) {
  if (mode === "shuffle")
    return <Badge variant="outline" className="gap-1"><Shuffle className="h-3 w-3" />Shuffle</Badge>
  return <Badge variant="outline" className="gap-1"><List className="h-3 w-3" />Sequential</Badge>
}

// ── Add Tracks Dialog ──

function AddTracksDialog({
  open,
  onOpenChange,
  library,
  existingPaths,
  onAdd,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  library: Track[]
  existingPaths: string[]
  onAdd: (paths: string[]) => void
}) {
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>([])

  const available = library.filter(
    (t) =>
      !existingPaths.includes(t.path) &&
      (search === "" ||
        [t.title, t.artist, t.album].some((f) =>
          f.toLowerCase().includes(search.toLowerCase())
        ))
  )

  const toggle = (path: string) =>
    setSelected((prev) =>
      prev.includes(path) ? prev.filter((x) => x !== path) : [...prev, path]
    )

  const handleAdd = () => {
    onAdd(selected)
    setSelected([])
    setSearch("")
    onOpenChange(false)
    toast.success(`${selected.length} track${selected.length !== 1 ? "s" : ""} added`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Tracks</DialogTitle>
          <DialogDescription>
            Select tracks from your library to add to this playlist.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tracks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded border">
          {library.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Library is empty. Run a scan from the Library page first.
            </p>
          ) : available.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No tracks available</p>
          ) : (
            <Table>
              <TableBody>
                {available.map((track) => {
                  const isSelected = selected.includes(track.path)
                  return (
                    <TableRow
                      key={track.path}
                      className="cursor-pointer"
                      onClick={() => toggle(track.path)}
                    >
                      <TableCell className="w-8">
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center border",
                          isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        )}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{track.title}</p>
                        <p className="text-[10px] text-muted-foreground">{track.artist}</p>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{track.genre || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{track.duration}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {selected.length > 0 && (
          <p className="text-xs text-muted-foreground">{selected.length} track{selected.length !== 1 ? "s" : ""} selected</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setSelected([]); onOpenChange(false) }}>Cancel</Button>
          <Button onClick={handleAdd} disabled={selected.length === 0}>
            Add {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Playlist Detail Panel ──

function PlaylistDetail({
  playlist,
  library,
  mounts,
  onChange,
  onDelete,
  onAutoDJStart,
  onAutoDJStop,
  onAutoDJRestart,
  isDirty,
}: {
  playlist:        Playlist
  library:         Track[]
  mounts:          APIMount[]
  onChange:        (updated: Playlist) => void
  onDelete:        () => void
  onAutoDJStart:   (mountName: string) => Promise<void>
  onAutoDJStop:    (mountName: string) => Promise<void>
  onAutoDJRestart: (mountName: string) => Promise<void>
  isDirty:         boolean
}) {
  const [addOpen, setAddOpen]   = React.useState(false)
  const [nameEdit, setNameEdit] = React.useState(false)
  const [nameValue, setNameValue] = React.useState(playlist.name)

  // Resolve track_paths against the loaded library
  const tracksByPath = React.useMemo(
    () => new Map(library.map((t) => [t.path, t])),
    [library],
  )
  const tracks = playlist.trackPaths
    .map((p) => tracksByPath.get(p))
    .filter((t): t is Track => t !== undefined)

  const missingCount = playlist.trackPaths.length - tracks.length

  const move = (index: number, dir: -1 | 1) => {
    const next = [...playlist.trackPaths]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ ...playlist, trackPaths: next })
  }

  const removeTrack = (path: string) => {
    onChange({ ...playlist, trackPaths: playlist.trackPaths.filter((p) => p !== path) })
    toast.success("Track removed")
  }

  const saveName = () => {
    if (nameValue.trim()) {
      onChange({ ...playlist, name: nameValue.trim() })
      toast.success("Playlist renamed")
    }
    setNameEdit(false)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b pb-4">
        <div className="flex items-center gap-2">
          {nameEdit ? (
            <div className="flex flex-1 items-center gap-2">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName() }}
                className="h-8 text-base font-semibold"
                autoFocus
              />
              <Button size="sm" onClick={saveName}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNameEdit(false); setNameValue(playlist.name) }}>Cancel</Button>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <h2 className="text-base font-semibold">{playlist.name}</h2>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNameEdit(true)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{playlist.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This playlist will be permanently removed. Tracks in your library are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Playback mode */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mode</Label>
            <Select
              value={playlist.mode}
              onValueChange={(v) => onChange({ ...playlist, mode: v as PlayMode })}
            >
              <SelectTrigger className="h-7 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">Sequential</SelectItem>
                <SelectItem value="shuffle">Shuffle</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assigned mount */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mount</Label>
            <Select
              value={playlist.assignedMount || "__none__"}
              onValueChange={(v) =>
                onChange({ ...playlist, assignedMount: v === "__none__" ? "" : v, autoDJ: false })
              }
            >
              <SelectTrigger className="h-7 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {mounts.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No mounts — create one first
                  </div>
                ) : (
                  mounts.map((m) => (
                    <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* AutoDJ toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">AutoDJ</Label>
            <Switch
              checked={playlist.autoDJ}
              disabled={!playlist.assignedMount || tracks.length === 0}
              onCheckedChange={async (v) => {
                if (!playlist.assignedMount) {
                  toast.error("Assign a mount first")
                  return
                }
                if (v && tracks.length === 0) {
                  toast.error("Add tracks before starting AutoDJ")
                  return
                }
                onChange({ ...playlist, autoDJ: v })
                try {
                  if (v) await onAutoDJStart(playlist.assignedMount)
                  else   await onAutoDJStop(playlist.assignedMount)
                } catch {
                  // revert on failure
                  onChange({ ...playlist, autoDJ: !v })
                }
              }}
            />
          </div>

          {/* Crossfade */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Crossfade</Label>
            <Input
              type="number"
              min={0}
              max={10000}
              step={500}
              value={playlist.crossfade}
              onChange={(e) => onChange({ ...playlist, crossfade: Number(e.target.value) })}
              className="h-7 w-20"
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {tracks.length} tracks · {totalDuration(tracks)}
            {missingCount > 0 && (
              <span className="ml-2 text-amber-500">
                ({missingCount} missing from library)
              </span>
            )}
          </p>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Tracks
          </Button>
        </div>

        {/* Live playlist dirty warning */}
        {playlist.autoDJ && playlist.assignedMount && isDirty && (
          <div className="flex items-center justify-between gap-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Changes will take effect after AutoDJ restart.
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-amber-500/40 text-xs"
              onClick={() => onAutoDJRestart(playlist.assignedMount)}
            >
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Restart Now
            </Button>
          </div>
        )}
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ListMusic className="h-10 w-10 opacity-20" />
            <p className="text-sm">Playlist is empty</p>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Tracks
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-20">Order</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tracks.map((track, index) => (
                <TableRow key={track.path}>
                  <TableCell className="text-muted-foreground/40">
                    <GripVertical className="h-4 w-4" />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <p className="text-xs font-medium max-w-[160px] truncate">{track.title}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{track.artist}</TableCell>
                  <TableCell className="font-mono text-xs">{track.duration}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === tracks.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeTrack(track.path)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AddTracksDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        library={library}
        existingPaths={playlist.trackPaths}
        onAdd={(paths) => onChange({ ...playlist, trackPaths: [...playlist.trackPaths, ...paths] })}
      />
    </div>
  )
}

// ── New Playlist Dialog ──

function NewPlaylistDialog({ onCreated }: { onCreated: (name: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Playlist name is required")
      return
    }
    onCreated(name.trim())
    setName("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        New Playlist
      </Button>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>New Playlist</DialogTitle>
          <DialogDescription>Give your playlist a name to get started.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Name</Label>
          <Input
            placeholder="e.g. Morning Mix"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──

// Apply active sessions to a playlist list, setting assignedMount + autoDJ.
function applySessionsToPlaylists(
  playlists: Playlist[],
  sessions: APIAutoDJSession[],
): Playlist[] {
  // Build map: playlistId -> mountName for running sessions.
  const activeMap = new Map(sessions.map((s) => [s.playlist_id, s.mount]))
  return playlists.map((pl) => {
    const mount = activeMap.get(pl.id)
    if (mount) {
      return { ...pl, assignedMount: mount, autoDJ: true }
    }
    // If this playlist was previously running but is no longer in sessions, reset.
    if (pl.autoDJ && pl.assignedMount) {
      return { ...pl, autoDJ: false }
    }
    return pl
  })
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists]   = React.useState<Playlist[]>([])
  const [library, setLibrary]       = React.useState<Track[]>([])
  const [mounts, setMounts]         = React.useState<APIMount[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading]       = React.useState(true)
  // Track which playlists have unsaved track/mode changes while AutoDJ is running.
  const [dirtyIds, setDirtyIds]     = React.useState<Set<string>>(new Set())

  // Initial load: playlists + library + mounts + active autodj sessions in parallel.
  React.useEffect(() => {
    Promise.all([
      api.playlists.list().catch((): APIPlaylist[] => []),
      api.library.list().catch(() => []),
      api.mounts.list().catch((): APIMount[] => []),
      api.autoDJSessions().catch((): APIAutoDJSession[] => []),
    ]).then(([pls, tracks, ms, sessions]) => {
      const adapted = applySessionsToPlaylists(pls.map(adaptApiPlaylist), sessions)
      setPlaylists(adapted)
      setLibrary(tracks.map(adaptApiTrack))
      setMounts(ms)
      if (adapted.length > 0) setSelectedId(adapted[0].id)
      setLoading(false)
    })
  }, [])

  // Poll active sessions every 5 s to keep autoDJ badges in sync.
  React.useEffect(() => {
    const poll = () => {
      api.autoDJSessions()
        .then((sessions) => {
          setPlaylists((prev) => applySessionsToPlaylists(prev, sessions))
        })
        .catch(() => {})
    }
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  const selected = playlists.find((p) => p.id === selectedId) ?? null

  // Persist changes to the server and track dirty state for live playlists.
  const updatePlaylist = (updated: Playlist) => {
    const prev = playlists.find((p) => p.id === updated.id)
    const trackOrModeChanged =
      prev &&
      (JSON.stringify(prev.trackPaths) !== JSON.stringify(updated.trackPaths) ||
        prev.mode !== updated.mode)

    setPlaylists((ps) => ps.map((p) => (p.id === updated.id ? updated : p)))

    // Mark dirty if AutoDJ is live and tracks/mode changed.
    if (updated.autoDJ && updated.assignedMount && trackOrModeChanged) {
      setDirtyIds((d) => new Set([...d, updated.id]))
    }

    api.playlists.update(updated.id, {
      name:         updated.name,
      mode:         updated.mode,
      crossfade_ms: updated.crossfade,
      track_paths:  updated.trackPaths,
    }).catch((err) => toast.error(`Save failed: ${err.message}`))
  }

  const deletePlaylist = (id: string) => {
    api.playlists.delete(id)
      .then(() => {
        setPlaylists((prev) => prev.filter((p) => p.id !== id))
        setDirtyIds((d) => { const n = new Set(d); n.delete(id); return n })
        if (selectedId === id) setSelectedId(playlists.find((p) => p.id !== id)?.id ?? null)
        toast.success("Playlist deleted")
      })
      .catch((err) => toast.error(`Delete failed: ${err.message}`))
  }

  const createPlaylist = (name: string) => {
    api.playlists.create({ name, mode: "sequential", crossfade_ms: 2000, track_paths: [] })
      .then((p) => {
        const newPl = adaptApiPlaylist(p)
        setPlaylists((prev) => [newPl, ...prev])
        setSelectedId(newPl.id)
        toast.success(`Playlist "${name}" created`)
      })
      .catch((err) => toast.error(`Create failed: ${err.message}`))
  }

  const handleAutoDJStart = async (mountName: string, pl: Playlist) => {
    await api.mounts.startAutoDJ(mountName, { playlist_id: pl.id, mode: pl.mode })
    setPlaylists((prev) => prev.map((p) =>
      p.id === pl.id ? { ...p, autoDJ: true, assignedMount: mountName } : p
    ))
    setDirtyIds((d) => { const n = new Set(d); n.delete(pl.id); return n })
    toast.success(`AutoDJ started on ${mountName}`)
  }

  const handleAutoDJStop = async (mountName: string, pl: Playlist) => {
    await api.mounts.stopAutoDJ(mountName)
    setPlaylists((prev) => prev.map((p) =>
      p.id === pl.id ? { ...p, autoDJ: false } : p
    ))
    setDirtyIds((d) => { const n = new Set(d); n.delete(pl.id); return n })
    toast.success("AutoDJ stopped")
  }

  const handleAutoDJRestart = async (mountName: string, pl: Playlist) => {
    try {
      await api.mounts.stopAutoDJ(mountName).catch(() => {})
      await api.mounts.startAutoDJ(mountName, { playlist_id: pl.id, mode: pl.mode })
      setPlaylists((prev) => prev.map((p) =>
        p.id === pl.id ? { ...p, autoDJ: true, assignedMount: mountName } : p
      ))
      setDirtyIds((d) => { const n = new Set(d); n.delete(pl.id); return n })
      toast.success("AutoDJ restarted with updated playlist")
    } catch (err: unknown) {
      toast.error(`Restart failed: ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Playlists</h1>
          <p className="text-sm text-muted-foreground">
            Build and manage AutoDJ playlists
          </p>
        </div>
        <NewPlaylistDialog onCreated={createPlaylist} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3" style={{ minHeight: "600px" }}>
        {/* Left: Playlist list */}
        <div className="space-y-2">
          {loading ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <ListMusic className="h-10 w-10 opacity-20 animate-pulse" />
                <p className="text-sm">Loading…</p>
              </CardContent>
            </Card>
          ) : playlists.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <ListMusic className="h-10 w-10 opacity-20" />
                <p className="text-sm">No playlists yet</p>
                <p className="text-xs">Click &quot;New Playlist&quot; to create one</p>
              </CardContent>
            </Card>
          ) : (
            playlists.map((pl) => {
              const trackCount = pl.trackPaths.length
              return (
                <button
                  key={pl.id}
                  onClick={() => setSelectedId(pl.id)}
                  className={cn(
                    "w-full rounded border p-3 text-left transition-colors",
                    selectedId === pl.id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{pl.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {trackCount} track{trackCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {pl.autoDJ && (
                        <Badge className="border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400 text-[10px]">
                          AutoDJ
                        </Badge>
                      )}
                      {pl.assignedMount && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Radio className="h-3 w-3" />
                          {pl.assignedMount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <ModeBadge mode={pl.mode} />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Right: Playlist detail */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          <CardContent className="flex flex-1 flex-col p-4 overflow-hidden">
            {selected ? (
              <PlaylistDetail
                key={selected.id}
                playlist={selected}
                library={library}
                mounts={mounts}
                isDirty={dirtyIds.has(selected.id)}
                onChange={updatePlaylist}
                onDelete={() => deletePlaylist(selected.id)}
                onAutoDJStart={(mountName) => handleAutoDJStart(mountName, selected)}
                onAutoDJStop={(mountName) => handleAutoDJStop(mountName, selected)}
                onAutoDJRestart={(mountName) => handleAutoDJRestart(mountName, selected)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <ListMusic className="h-12 w-12 opacity-20" />
                <p className="text-sm">
                  {loading ? "Loading…" : "Select a playlist to edit"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
