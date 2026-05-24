"use client"

import * as React from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Plus, ListMusic, Trash2, Search, Check, Play, GripVertical,
  Loader2, CheckCircle2, XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  api, type APIPlaylist, type APIMount, type APITrack, type APIAutoDJSession,
  type APIImportItem, type APIImportJob,
} from "@/lib/api"

// ── Types ──

type PlayMode = "sequential" | "shuffle"

type Track = {
  path: string; title: string; artist: string; album: string
  genre: string; duration: string; durationSec: number; folder: string
}

type Playlist = {
  id: string; name: string; mode: PlayMode; assignedMount: string
  autoDJ: boolean; crossfade: number; trackPaths: string[]
}

// ── Helpers ──

function formatMs(ms: number): string {
  const sec = Math.round(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}

function totalDurationLabel(paths: string[], byPath: Map<string, Track>): string {
  const sec = paths.reduce((sum, p) => sum + (byPath.get(p)?.durationSec ?? 0), 0)
  if (sec === 0) return ""
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function adaptApiTrack(t: APITrack): Track {
  return {
    path: t.path,
    title: t.title || t.path.split("/").pop()?.replace(/\.[^.]+$/, "") || t.path,
    artist: t.artist || "Unknown",
    album: t.album || "",
    genre: t.genre || "",
    duration: formatMs(t.duration_ms),
    durationSec: Math.round(t.duration_ms / 1000),
    folder: t.folder || "",
  }
}

function adaptApiPlaylist(p: APIPlaylist): Playlist {
  return {
    id: p.id, name: p.name,
    mode: p.mode === "shuffle" ? "shuffle" : "sequential",
    assignedMount: "", autoDJ: false,
    crossfade: p.crossfade_ms,
    trackPaths: p.track_paths ?? [],
  }
}

function applySessionsToPlaylists(playlists: Playlist[], sessions: APIAutoDJSession[]): Playlist[] {
  const activeMap = new Map(sessions.map((s) => [s.playlist_id, s.mount]))
  return playlists.map((pl) => {
    const mount = activeMap.get(pl.id)
    if (mount) return { ...pl, assignedMount: mount, autoDJ: true }
    if (pl.autoDJ && pl.assignedMount) return { ...pl, autoDJ: false }
    return pl
  })
}

// ── Add Tracks Dialog ──

/** Strip the longest common directory prefix so folder labels are relative. */
function folderPrefix(folders: string[]): string {
  if (folders.length === 0) return ""
  let prefix = folders[0]
  for (const f of folders.slice(1)) {
    while (f !== prefix && !f.startsWith(prefix + "/")) {
      const idx = prefix.lastIndexOf("/")
      if (idx <= 0) return ""
      prefix = prefix.slice(0, idx)
    }
  }
  return prefix
}

function AddTracksDialog({ open, onOpenChange, library, existingPaths, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void
  library: Track[]; existingPaths: string[]; onAdd: (paths: string[]) => void
}) {
  const [search, setSearch]           = React.useState("")
  const [selected, setSelected]       = React.useState<Set<string>>(new Set())
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null)

  const available = React.useMemo(
    () => library.filter((t) => !existingPaths.includes(t.path)),
    [library, existingPaths],
  )

  // Build sorted folder list + common prefix for display names
  const { folders, prefix } = React.useMemo(() => {
    const unique = Array.from(new Set(available.map((t) => t.folder).filter(Boolean))).sort()
    return { folders: unique, prefix: folderPrefix(unique) }
  }, [available])

  const displayName = (folder: string) => {
    const rel = prefix ? folder.slice(prefix.length).replace(/^\//, "") : folder
    return rel || folder.split("/").pop() || folder
  }

  const folderCountMap = React.useMemo(() => {
    const m: Record<string, number> = {}
    available.forEach((t) => { if (t.folder) m[t.folder] = (m[t.folder] ?? 0) + 1 })
    return m
  }, [available])

  const folderTracks = React.useMemo(
    () => activeFolder === null ? available : available.filter((t) => t.folder === activeFolder),
    [available, activeFolder],
  )

  const visibleTracks = React.useMemo(() => {
    const q = search.toLowerCase()
    return q === "" ? folderTracks
      : folderTracks.filter((t) =>
          [t.title, t.artist, t.album].some((f) => f.toLowerCase().includes(q))
        )
  }, [folderTracks, search])

  const allVisibleSelected = visibleTracks.length > 0 && visibleTracks.every((t) => selected.has(t.path))

  const toggle = (path: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const n = new Set(prev)
      allVisibleSelected
        ? visibleTracks.forEach((t) => n.delete(t.path))
        : visibleTracks.forEach((t) => n.add(t.path))
      return n
    })

  const handleAdd = () => {
    const paths = Array.from(selected)
    onAdd(paths); setSelected(new Set()); setSearch(""); onOpenChange(false)
    toast.success(`${paths.length} track${paths.length !== 1 ? "s" : ""} added`)
  }

  const handleClose = () => { setSelected(new Set()); setSearch(""); onOpenChange(false) }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 bg-ink-900 border-ink-800 flex flex-col overflow-hidden max-h-[80vh]">

        {/* Header */}
        <DialogHeader className="shrink-0 px-5 pt-5 pb-4 border-b border-ink-800">
          <DialogTitle className="text-ink-100">Add Tracks</DialogTitle>
          <DialogDescription className="text-ink-500">
            {selected.size > 0
              ? `${selected.size} track${selected.size !== 1 ? "s" : ""} selected`
              : "Browse by folder or search across your library."}
          </DialogDescription>
        </DialogHeader>

        {/* Body: folder rail + track list */}
        <div className="flex flex-1 min-h-0">

          {/* Folder rail */}
          <div className="w-44 shrink-0 border-r border-ink-800 overflow-y-auto py-1">
            <button
              onClick={() => setActiveFolder(null)}
              className={cn(
                "w-full px-3 py-2 text-left text-[12.5px] transition-colors",
                activeFolder === null
                  ? "bg-ink-800 text-ink-100 font-medium"
                  : "text-ink-400 hover:text-ink-200 hover:bg-ink-800/50",
              )}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="truncate">All tracks</span>
                <span className="font-mono text-[11px] text-ink-600 shrink-0">{available.length}</span>
              </span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() => setActiveFolder(folder)}
                className={cn(
                  "w-full px-3 py-2 text-left text-[12.5px] transition-colors",
                  activeFolder === folder
                    ? "bg-ink-800 text-ink-100 font-medium"
                    : "text-ink-400 hover:text-ink-200 hover:bg-ink-800/50",
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="truncate" title={displayName(folder)}>{displayName(folder)}</span>
                  <span className="font-mono text-[11px] text-ink-600 shrink-0">{folderCountMap[folder] ?? 0}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Track list */}
          <div className="flex flex-1 min-w-0 flex-col">

            {/* Search + select-all bar */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-ink-800">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500 h-3.5 w-3.5" />
                <input
                  className="h-8 w-full bg-ink-950 border border-ink-800 pl-8 pr-3 text-[12px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
                  placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {visibleTracks.length > 0 && (
                <button
                  onClick={toggleAllVisible}
                  className="flex items-center gap-1.5 shrink-0 text-[12px] text-ink-400 hover:text-ink-200 transition-colors"
                >
                  <div className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center border",
                    allVisibleSelected ? "border-k-500 bg-k-500" : "border-ink-700",
                  )}>
                    {allVisibleSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span>All</span>
                </button>
              )}
            </div>

            {/* Scrollable track rows */}
            <div className="flex-1 overflow-y-auto">
              {library.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-ink-500">Library is empty. Scan from the Library page first.</p>
              ) : visibleTracks.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-ink-500">No tracks available</p>
              ) : (
                visibleTracks.map((track) => {
                  const isSel = selected.has(track.path)
                  return (
                    <div key={track.path}
                      onClick={() => toggle(track.path)}
                      className="flex items-center gap-3 px-3 py-2.5 border-b border-ink-800/60 last:border-0 cursor-pointer hover:bg-white/[0.025] transition-colors"
                    >
                      <div className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center border",
                        isSel ? "border-k-500 bg-k-500" : "border-ink-700",
                      )}>
                        {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] text-ink-100 truncate font-medium">{track.title}</p>
                        <p className="text-[11px] text-ink-500 truncate">{track.artist}</p>
                      </div>
                      <span className="text-[11px] text-ink-500 font-mono shrink-0">{track.duration}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 px-5 py-4 border-t border-ink-800">
          <button onClick={handleClose}
            className="h-9 px-4 border border-ink-800 hover:bg-ink-800 text-[13px] text-ink-200 transition-colors">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={selected.size === 0}
            className="h-9 px-4 bg-k-500 hover:bg-k-400 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors">
            Add {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Track Row ──

function TrackRow({ track, index, onRemove,
  isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop,
}: {
  track: Track; index: number
  onRemove: () => void
  isDragging: boolean; isDragOver: boolean
  onDragStart: () => void; onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void; onDrop: () => void
}) {
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart() }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(e) }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "grid items-center gap-3 border-b border-ink-800/60 last:border-0 px-1 py-2.5 cursor-grab select-none transition-colors",
        isDragOver && "border-t-2 border-t-k-500 bg-ink-900/60",
        isDragging ? "opacity-30" : "hover:bg-white/[0.02]",
      )}
      style={{ gridTemplateColumns: "20px 20px 1fr 55px 52px" }}
    >
      {/* Grip */}
      <div className="flex justify-center text-ink-700">
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {/* Index */}
      <div className="flex justify-center">
        {hovered
          ? <Play className="h-3 w-3 fill-current text-ink-400" />
          : <span className="font-mono text-[11px] text-ink-600">{index + 1}</span>
        }
      </div>

      {/* Title + Artist */}
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100 font-medium">{track.title}</span>
        <span className="max-w-[120px] shrink-0 truncate text-[11px] text-ink-500">{track.artist}</span>
      </div>

      {/* Duration */}
      <div className="text-right font-mono text-[12px] text-ink-500">{track.duration}</div>

      {/* Remove */}
      <div className={cn("flex items-center justify-end transition-opacity", hovered ? "opacity-100" : "opacity-0")}>
        <button onClick={onRemove}
          className="flex h-6 w-6 items-center justify-center text-ink-500 hover:bg-ink-800 hover:text-red-400 transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ── Playlist Detail ──

function PlaylistDetail({ playlist, library, onChange, onDelete }: {
  playlist: Playlist; library: Track[]
  onChange: (updated: Playlist) => void; onDelete: () => void
}) {
  const [addOpen, setAddOpen]         = React.useState(false)
  const [nameEdit, setNameEdit]       = React.useState(false)
  const [nameValue, setNameValue]     = React.useState(playlist.name)
  const [trackFilter, setTrackFilter] = React.useState("")
  const [dragIndex, setDragIndex]     = React.useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null)

  const tracksByPath = React.useMemo(() => new Map(library.map((t) => [t.path, t])), [library])
  const tracks = playlist.trackPaths.map((p) => tracksByPath.get(p)).filter((t): t is Track => t !== undefined)
  const visibleTracks = trackFilter
    ? tracks.filter((t) => t.title.toLowerCase().includes(trackFilter.toLowerCase()) || t.artist.toLowerCase().includes(trackFilter.toLowerCase()))
    : tracks
  const missingCount = playlist.trackPaths.length - tracks.length
  const totalDur = totalDurationLabel(playlist.trackPaths, tracksByPath)

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null); setDragOverIndex(null); return
    }
    const next = [...playlist.trackPaths]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, moved)
    onChange({ ...playlist, trackPaths: next })
    setDragIndex(null); setDragOverIndex(null)
  }

  const removeTrack = (path: string) => {
    onChange({ ...playlist, trackPaths: playlist.trackPaths.filter((p) => p !== path) })
    toast.success("Track removed")
  }

  const saveName = () => {
    if (nameValue.trim()) { onChange({ ...playlist, name: nameValue.trim() }); toast.success("Renamed") }
    setNameEdit(false)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-ink-800 px-8 pb-6 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {nameEdit ? (
              <div className="flex items-center gap-2">
                <input
                  className="border-b border-ink-600 bg-transparent text-[22px] font-bold tracking-tight text-ink-100 focus:border-k-500 focus:outline-none"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setNameEdit(false); setNameValue(playlist.name) } }}
                  autoFocus
                />
                <button onClick={saveName} className="h-7 px-3 bg-k-500 hover:bg-k-400 text-white text-[12px] font-semibold">Save</button>
                <button onClick={() => { setNameEdit(false); setNameValue(playlist.name) }} className="h-7 px-3 border border-ink-800 hover:bg-ink-800 text-[12px] text-ink-400">Cancel</button>
              </div>
            ) : (
              <h1 className="cursor-text truncate text-[22px] font-bold tracking-tight text-ink-100 hover:opacity-80 transition-opacity"
                onClick={() => setNameEdit(true)} title="Click to rename">
                {playlist.name}
              </h1>
            )}
            <p className="mt-1 font-mono text-[11px] text-ink-500">
              {tracks.length} track{tracks.length !== 1 ? "s" : ""}
              {totalDur ? ` · ${totalDur}` : ""}
              {missingCount > 0 && <span className="ml-2 text-amber-500">· {missingCount} missing</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-k-500 text-white hover:bg-k-600 transition-colors">
              <Plus className="h-3 w-3" /> Add tracks
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="h-8 w-8 flex items-center justify-center border border-ink-800 hover:bg-red-500/10 hover:border-red-500/30 text-ink-500 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{playlist.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>Permanently removed. Library tracks are not affected.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-ink-500">
            <ListMusic className="h-10 w-10 opacity-20" />
            <p className="text-[12.5px]">Playlist is empty</p>
            <button onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-k-500 text-white hover:bg-k-600 transition-colors">
              <Plus className="h-3 w-3" /> Add tracks
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-ink-500">
                Tracks
              </span>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500 h-3 w-3" />
                <input
                  className="h-7 w-full bg-transparent border border-ink-800 pl-7 pr-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
                  placeholder="Filter…" value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="border-t border-ink-800">
              {visibleTracks.map((track, i) => {
                const realIndex = playlist.trackPaths.indexOf(track.path)
                return (
                  <TrackRow
                    key={track.path}
                    track={track}
                    index={i}
                    onRemove={() => removeTrack(track.path)}
                    isDragging={dragIndex === realIndex}
                    isDragOver={dragOverIndex === realIndex}
                    onDragStart={() => setDragIndex(realIndex)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                    onDragOver={() => setDragOverIndex(realIndex)}
                    onDrop={() => handleDrop(realIndex)}
                  />
                )
              })}
              <button type="button"
                className="grid w-full items-center gap-3 px-1 py-3 text-left text-ink-600 hover:text-ink-300 transition-colors"
                style={{ gridTemplateColumns: "20px 20px 1fr" }}
                onClick={() => setAddOpen(true)}>
                <div /><div className="flex justify-center"><Plus className="h-3.5 w-3.5" /></div>
                <span className="text-[12.5px]">Add track…</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <AddTracksDialog open={addOpen} onOpenChange={setAddOpen} library={library}
        existingPaths={playlist.trackPaths}
        onAdd={(paths) => onChange({ ...playlist, trackPaths: [...playlist.trackPaths, ...paths] })}
      />
    </div>
  )
}

// ── YouTube icon ──

function YtIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}

// ── YouTube → Playlist Dialog ──

type YTStep = "input" | "preview" | "downloading"

function YouTubeToPlaylistDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (playlist: Playlist) => void
}) {
  const [step, setStep]                 = React.useState<YTStep>("input")
  const [url, setUrl]                   = React.useState("")
  const [playlistName, setPlaylistName] = React.useState("")
  const [previewing, setPreviewing]     = React.useState(false)
  const [preview, setPreview]           = React.useState<{ type: string; title: string; items: APIImportItem[] } | null>(null)
  const [selected, setSelected]         = React.useState<Set<string>>(new Set())
  const [jobId, setJobId]               = React.useState<string | null>(null)
  const [jobItems, setJobItems]         = React.useState<APIImportItem[]>([])
  const [creating, setCreating]         = React.useState(false)

  const reset = () => {
    setStep("input"); setUrl(""); setPlaylistName(""); setPreviewing(false)
    setPreview(null); setSelected(new Set()); setJobId(null); setJobItems([]); setCreating(false)
  }

  const handleClose = () => { reset(); onOpenChange(false) }

  const handlePreview = async () => {
    if (!url.trim()) return
    setPreviewing(true)
    try {
      const result = await api.library.ytPreview(url.trim())
      setPreview(result)
      setSelected(new Set(result.items.map((i) => i.ytid)))
      if (result.title && !playlistName.trim()) setPlaylistName(result.title)
      setStep("preview")
    } catch (err: unknown) {
      toast.error(`Preview failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPreviewing(false)
    }
  }

  const handleStartDownload = async () => {
    if (!preview) return
    const items = preview.items.filter((i) => selected.has(i.ytid))
    if (items.length === 0) { toast.error("Select at least one track"); return }
    if (!playlistName.trim()) { toast.error("Playlist name is required"); return }
    setStep("downloading")
    try {
      const { job_id } = await api.library.ytImport({ items })
      setJobId(job_id)
    } catch (err: unknown) {
      toast.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`)
      setStep("preview")
    }
  }

  // Poll job status and create playlist when done
  React.useEffect(() => {
    if (!jobId) return
    const capturedName = playlistName.trim() || "YouTube Import"
    let handled = false

    const finish = async (j: APIImportJob) => {
      if (handled) return
      handled = true

      setCreating(true)
      await new Promise((r) => setTimeout(r, 3000))

      const paths = j.items
        .filter((i) => i.status === "done" && i.path)
        .map((i) => i.path as string)

      if (paths.length === 0) {
        toast.error("No tracks were downloaded successfully — check that yt-dlp is installed")
        setCreating(false)
        setStep("preview")
        return
      }

      const failedCount = j.items.filter((i) => i.status === "error").length

      try {
        const pl = await api.playlists.create({
          name: capturedName,
          mode: "sequential",
          crossfade_ms: 2000,
          track_paths: paths,
        })
        onCreated(adaptApiPlaylist(pl))
        const label = failedCount > 0
          ? `${paths.length} track${paths.length !== 1 ? "s" : ""} (${failedCount} failed)`
          : `${paths.length} track${paths.length !== 1 ? "s" : ""}`
        toast.success(`"${capturedName}" created with ${label}`)
        reset()
        onOpenChange(false)
      } catch (err: unknown) {
        toast.error(`Create playlist failed: ${err instanceof Error ? err.message : String(err)}`)
        setCreating(false)
      }
    }

    const poll = async () => {
      try {
        const j = await api.library.importJob(jobId)
        setJobItems(j.items)
        if (j.status === "done" || j.status === "error") {
          clearInterval(timer)
          finish(j)
        }
      } catch { /* ignore */ }
    }

    const timer = setInterval(poll, 1500)
    poll()
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const toggleAll = () => {
    if (!preview) return
    const allSel = selected.size === preview.items.length
    setSelected(allSel ? new Set() : new Set(preview.items.map((i) => i.ytid)))
  }

  const toggleItem = (ytid: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(ytid) ? next.delete(ytid) : next.add(ytid)
      return next
    })

  const doneCount    = jobItems.filter((i) => i.status === "done").length
  const failCount    = jobItems.filter((i) => i.status === "error").length
  const activeCount  = jobItems.filter((i) => i.status === "pending" || i.status === "downloading").length
  const overallPct   = jobItems.length > 0 ? Math.round((doneCount / jobItems.length) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="p-0 sm:max-w-[580px] max-h-[88vh] flex flex-col gap-0 bg-ink-900 border-ink-800 overflow-hidden">

        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 pr-12 border-b border-ink-800">
          <div className="flex items-center gap-2.5">
            <YtIcon className="h-4 w-4 text-red-500 shrink-0" />
            <span className="text-[14px] font-semibold text-ink-100">Import from YouTube</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-500 leading-relaxed">
            {step === "input"       && "Paste a YouTube video or playlist URL to download audio and create a playlist."}
            {step === "preview"     && (preview?.type === "playlist"
              ? `${preview.items.length} tracks found — select which to download`
              : "Video found — confirm to download")}
            {step === "downloading" && (creating ? "Creating playlist…" : `Downloading… ${doneCount} / ${jobItems.length} done`)}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

          {/* Step 1: URL + name */}
          {step === "input" && (
            <div className="px-5 py-5 space-y-4 overflow-y-auto">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">YouTube URL</p>
                <input
                  className="h-9 w-full bg-ink-950 border border-ink-800 px-3 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
                  placeholder="https://www.youtube.com/watch?v=… or /playlist?list=…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                  autoFocus
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">
                  Playlist Name <span className="normal-case text-ink-700">(optional)</span>
                </p>
                <input
                  className="h-9 w-full bg-ink-950 border border-ink-800 px-3 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
                  placeholder="Auto-filled from YouTube title"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-ink-700 leading-relaxed">
                Downloads audio as MP3. Only download content you own or have permission to use.
              </p>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && preview && (
            <>
              {/* Fixed controls */}
              <div className="shrink-0 px-5 py-4 space-y-3 border-b border-ink-800 bg-ink-900">
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">Playlist Name</p>
                  <input
                    className="h-9 w-full bg-ink-950 border border-ink-800 px-3 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    placeholder="Playlist name"
                  />
                </div>
                {preview.type === "playlist" && (
                  <button
                    className="flex items-center gap-2.5 text-[12px] text-ink-400 hover:text-ink-200 transition-colors"
                    onClick={toggleAll}
                  >
                    <div className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center border",
                      selected.size === preview.items.length ? "border-k-500 bg-k-500" : "border-ink-700"
                    )}>
                      {selected.size === preview.items.length && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span>{selected.size} / {preview.items.length} selected</span>
                  </button>
                )}
              </div>

              {/* Scrollable track list */}
              <div className="flex-1 overflow-y-auto">
                {preview.items.map((item, idx) => {
                  const isSel = selected.has(item.ytid)
                  return (
                    <div
                      key={item.ytid}
                      className="flex items-center gap-3 px-5 py-2.5 border-b border-ink-800/50 last:border-0 cursor-pointer hover:bg-white/[0.025] transition-colors"
                      onClick={() => toggleItem(item.ytid)}
                    >
                      <div className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center border",
                        isSel ? "border-k-500 bg-k-500" : "border-ink-700"
                      )}>
                        {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <span className="font-mono text-[11px] text-ink-700 w-6 shrink-0 text-right tabular-nums">{idx + 1}</span>
                      {item.thumbnail
                        ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumbnail} alt="" className="h-9 w-16 shrink-0 object-cover" />
                        ) : (
                          <div className="h-9 w-16 shrink-0 bg-ink-800 flex items-center justify-center">
                            <YtIcon className="h-3.5 w-3.5 text-ink-600" />
                          </div>
                        )
                      }
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-ink-100 font-medium truncate">{item.title}</p>
                        {item.artist && <p className="text-[11px] text-ink-500 truncate">{item.artist}</p>}
                      </div>
                      {item.duration_ms > 0 && (
                        <span className="text-[11px] text-ink-500 font-mono shrink-0 tabular-nums">{formatMs(item.duration_ms)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Step 3: Downloading */}
          {step === "downloading" && (
            <>
              {/* Overall progress bar */}
              {jobItems.length > 0 && (
                <div className="shrink-0 px-5 py-3 border-b border-ink-800">
                  <div className="flex items-center justify-between mb-2 text-[11.5px]">
                    <span className="text-ink-500">
                      {doneCount} done{failCount > 0 ? ` · ${failCount} failed` : ""}{activeCount > 0 ? ` · ${activeCount} remaining` : ""}
                    </span>
                    <span className="font-mono text-ink-500 tabular-nums">{overallPct}%</span>
                  </div>
                  <div className="h-0.5 bg-ink-800 overflow-hidden">
                    <div className="h-full bg-k-500 transition-all duration-500" style={{ width: `${overallPct}%` }} />
                  </div>
                </div>
              )}

              {/* Scrollable item list */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-0.5">
                {jobItems.length === 0 ? (
                  <div className="flex items-center gap-2.5 py-6 text-ink-500">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span className="text-[12.5px]">Starting download…</span>
                  </div>
                ) : (
                  jobItems.map((item) => (
                    <div key={item.ytid} className="py-2">
                      <div className="flex items-center gap-2.5">
                        {item.status === "done"        && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                        {item.status === "error"       && <XCircle      className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        {item.status === "downloading" && <Loader2      className="h-3.5 w-3.5 animate-spin text-k-500 shrink-0" />}
                        {item.status === "pending"     && <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-ink-700" />}
                        <span className={cn(
                          "flex-1 truncate text-[12.5px]",
                          item.status === "done"  ? "text-ink-400" :
                          item.status === "error" ? "text-red-400" : "text-ink-200"
                        )}>
                          {item.title}
                        </span>
                        {item.status === "downloading" && (
                          <span className="font-mono text-[11px] text-k-400 shrink-0 tabular-nums">{Math.round(item.progress)}%</span>
                        )}
                      </div>
                      {item.status === "downloading" && (
                        <div className="mt-1.5 ml-6 h-0.5 overflow-hidden bg-ink-800">
                          <div className="h-full bg-k-500 transition-all duration-300" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                    </div>
                  ))
                )}
                {creating && (
                  <div className="flex items-center gap-2.5 border-t border-ink-800 pt-3 mt-2 text-ink-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span className="text-[12px]">Creating playlist…</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-t border-ink-800">
          <button
            onClick={handleClose}
            disabled={step === "downloading"}
            className="h-9 px-4 border border-ink-800 hover:bg-ink-800 text-[13px] text-ink-200 transition-colors disabled:opacity-40"
          >
            {step === "downloading" ? "Running…" : "Cancel"}
          </button>
          <div className="flex items-center gap-2">
            {step === "preview" && (
              <button
                onClick={() => setStep("input")}
                className="h-9 px-3 border border-ink-800 hover:bg-ink-800 text-[12.5px] text-ink-400 transition-colors"
              >
                ← Back
              </button>
            )}
            {step === "input" && (
              <button
                onClick={handlePreview}
                disabled={!url.trim() || previewing}
                className="h-9 px-4 bg-k-500 hover:bg-k-400 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors inline-flex items-center gap-2"
              >
                {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {previewing ? "Loading…" : "Preview →"}
              </button>
            )}
            {step === "preview" && (
              <button
                onClick={handleStartDownload}
                disabled={selected.size === 0 || !playlistName.trim()}
                className="h-9 px-4 bg-k-500 hover:bg-k-400 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
              >
                Download {selected.size > 0 ? `${selected.size} track${selected.size !== 1 ? "s" : ""}` : ""}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── New Playlist Dialog ──

function NewPlaylistDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: (name: string) => void
}) {
  const [name, setName] = React.useState("")
  const handleCreate = () => {
    if (!name.trim()) { toast.error("Name is required"); return }
    onCreated(name.trim()); setName(""); onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs bg-ink-900 border-ink-800">
        <DialogHeader>
          <DialogTitle className="text-ink-100">New Playlist</DialogTitle>
          <DialogDescription className="text-ink-500">Give your playlist a name to get started.</DialogDescription>
        </DialogHeader>
        <input
          className="h-9 w-full bg-ink-950 border border-ink-800 px-3 text-[13px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none"
          placeholder="e.g. Morning Mix" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }} autoFocus
        />
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="h-9 px-4 border border-ink-800 hover:bg-ink-800 text-[13px] text-ink-200 transition-colors">Cancel</button>
          <button onClick={handleCreate} className="h-9 px-4 bg-k-500 hover:bg-k-400 text-white text-[13px] font-semibold transition-colors">Create</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──

export default function PlaylistsPage() {
  const [playlists, setPlaylists]   = React.useState<Playlist[]>([])
  const [library, setLibrary]       = React.useState<Track[]>([])
  const [mounts, setMounts]         = React.useState<APIMount[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading]       = React.useState(true)
  const [dirtyIds, setDirtyIds]     = React.useState<Set<string>>(new Set())
  const [newOpen, setNewOpen]       = React.useState(false)
  const [ytOpen, setYtOpen]         = React.useState(false)

  const tracksByPath = React.useMemo(() => new Map(library.map((t) => [t.path, t])), [library])

  React.useEffect(() => {
    Promise.all([
      api.playlists.list().catch((): APIPlaylist[] => []),
      api.library.list().catch(() => []),
      api.mounts.list().catch((): APIMount[] => []),
      api.autoDJSessions().catch((): APIAutoDJSession[] => []),
    ]).then(([pls, tracks, ms, sessions]) => {
      const adapted = applySessionsToPlaylists(pls.map(adaptApiPlaylist), sessions)
      setPlaylists(adapted); setLibrary(tracks.map(adaptApiTrack)); setMounts(ms)
      if (adapted.length > 0) setSelectedId(adapted[0].id)
      setLoading(false)
    })
  }, [])

  React.useEffect(() => {
    const id = setInterval(() => {
      api.autoDJSessions()
        .then((sessions) => setPlaylists((prev) => applySessionsToPlaylists(prev, sessions)))
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [])

  const selected = playlists.find((p) => p.id === selectedId) ?? null

  const updatePlaylist = (updated: Playlist) => {
    const prev = playlists.find((p) => p.id === updated.id)
    const changed = prev && (JSON.stringify(prev.trackPaths) !== JSON.stringify(updated.trackPaths) || prev.mode !== updated.mode)
    setPlaylists((ps) => ps.map((p) => p.id === updated.id ? updated : p))
    if (updated.autoDJ && updated.assignedMount && changed) {
      setDirtyIds((d) => new Set([...d, updated.id]))
    }
    api.playlists.update(updated.id, { name: updated.name, mode: updated.mode, crossfade_ms: updated.crossfade, track_paths: updated.trackPaths })
      .catch((err) => toast.error(`Save failed: ${err.message}`))
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
        setPlaylists((prev) => [newPl, ...prev]); setSelectedId(newPl.id)
        toast.success(`Playlist "${name}" created`)
      })
      .catch((err) => toast.error(`Create failed: ${err.message}`))
  }

  const handleAutoDJStart = async (mountName: string, pl: Playlist, startTrackPath?: string) => {
    await api.mounts.startAutoDJ(mountName, { playlist_id: pl.id, mode: pl.mode, start_track_path: startTrackPath })
    setPlaylists((prev) => prev.map((p) => p.id === pl.id ? { ...p, autoDJ: true, assignedMount: mountName } : p))
    setDirtyIds((d) => { const n = new Set(d); n.delete(pl.id); return n })
    toast.success(startTrackPath ? "AutoDJ jumping to track…" : `AutoDJ started on ${mountName}`)
  }

  const handleAutoDJStop = async (mountName: string, pl: Playlist) => {
    await api.mounts.stopAutoDJ(mountName)
    setPlaylists((prev) => prev.map((p) => p.id === pl.id ? { ...p, autoDJ: false } : p))
    setDirtyIds((d) => { const n = new Set(d); n.delete(pl.id); return n })
    toast.success("AutoDJ stopped")
  }

  const handleAutoDJRestart = async (mountName: string, pl: Playlist) => {
    try {
      await api.mounts.stopAutoDJ(mountName).catch(() => {})
      await api.mounts.startAutoDJ(mountName, { playlist_id: pl.id, mode: pl.mode })
      setPlaylists((prev) => prev.map((p) => p.id === pl.id ? { ...p, autoDJ: true, assignedMount: mountName } : p))
      setDirtyIds((d) => { const n = new Set(d); n.delete(pl.id); return n })
      toast.success("AutoDJ restarted")
    } catch (err: unknown) {
      toast.error(`Restart failed: ${err instanceof Error ? err.message : String(err)}`); throw err
    }
  }

  const handlePlayFrom = async (pl: Playlist, trackPath: string) => {
    if (!pl.assignedMount) { toast.error("No mount assigned"); return }
    try {
      await api.mounts.stopAutoDJ(pl.assignedMount).catch(() => {})
      await handleAutoDJStart(pl.assignedMount, pl, trackPath)
    } catch (err: unknown) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="-mx-8 -my-10 flex overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>

      {/* Playlist rail */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-ink-800 bg-ink-900">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-800 px-4 py-4">
          <h2 className="text-[13px] font-semibold text-ink-100">Playlists</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setYtOpen(true)} title="Import from YouTube"
              className="h-7 w-7 flex items-center justify-center border border-ink-800 hover:bg-ink-800 text-red-600/60 hover:text-red-500 transition-colors">
              <YtIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setNewOpen(true)} title="New playlist"
              className="h-7 w-7 flex items-center justify-center border border-ink-800 hover:bg-ink-800 text-ink-400 hover:text-ink-200 transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-ink-500">
              <ListMusic className="h-7 w-7 opacity-20 animate-pulse" />
              <p className="text-[12px] font-mono">Loading…</p>
            </div>
          ) : playlists.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-ink-500">
              <ListMusic className="h-7 w-7 opacity-20" />
              <p className="text-[12px]">No playlists yet</p>
              <button onClick={() => setNewOpen(true)} className="text-[11.5px] text-k-400 hover:text-k-300 transition-colors">Create one →</button>
            </div>
          ) : (
            playlists.map((pl) => {
              const trackCount = pl.trackPaths.length
              const dur = totalDurationLabel(pl.trackPaths, tracksByPath)
              const isActive = selectedId === pl.id
              return (
                <button key={pl.id} type="button" onClick={() => setSelectedId(pl.id)}
                  className={cn("w-full px-3 py-2.5 text-left transition-colors",
                    isActive ? "bg-ink-800 border border-ink-700" : "border border-transparent hover:bg-ink-800/50"
                  )}>
                  <span className={cn("truncate text-[13px] font-medium", isActive ? "text-ink-100" : "text-ink-300")}>
                    {pl.name}
                  </span>
                  <div className="mt-0.5 font-mono text-[11px] text-ink-500">
                    {trackCount > 0
                      ? `${trackCount} track${trackCount !== 1 ? "s" : ""}${dur ? ` · ${dur}` : ""}`
                      : "Empty"
                    }
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Detail panel */}
      <main className="flex flex-1 flex-col overflow-hidden bg-ink-950">
        {selected ? (
          <PlaylistDetail
            key={selected.id} playlist={selected} library={library}
            onChange={updatePlaylist} onDelete={() => deletePlaylist(selected.id)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-500">
            <ListMusic className="h-12 w-12 opacity-20" />
            <p className="text-[13px]">
              {loading ? "Loading…" : playlists.length === 0 ? "Create a playlist to get started" : "Select a playlist to edit"}
            </p>
            {!loading && playlists.length === 0 && (
              <button onClick={() => setNewOpen(true)} className="text-[12px] text-k-400 hover:text-k-300 transition-colors">
                New Playlist →
              </button>
            )}
          </div>
        )}
      </main>

      <NewPlaylistDialog open={newOpen} onOpenChange={setNewOpen} onCreated={createPlaylist} />

      <YouTubeToPlaylistDialog
        open={ytOpen}
        onOpenChange={setYtOpen}
        onCreated={(pl) => {
          setPlaylists((prev) => [pl, ...prev])
          setSelectedId(pl.id)
          // Reload library so newly downloaded tracks resolve in the detail panel
          api.library.list()
            .then((ts) => setLibrary(ts.map(adaptApiTrack)))
            .catch(() => {})
        }}
      />
    </div>
  )
}
