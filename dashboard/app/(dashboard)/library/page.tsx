"use client"

import * as React from "react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Search,
  FolderOpen,
  Music2,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  Pencil,
  RotateCcw,
} from "lucide-react"

function YtIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  )
}
import { toast } from "sonner"
import {
  api,
  type APITrack,
  type APIImportItem,
  type APIImportJob,
  type APIUploadResult,
} from "@/lib/api"

// ── Types ──

type Track = {
  id:             string
  path:           string
  title:          string
  artist:         string
  album:          string
  genre:          string
  duration:       string
  durationSec:    number
  bitrate:        string
  size:           string
  folder:         string
  dateAdded:      string
  hasOverride:    boolean
  originalTitle:  string
  originalArtist: string
  originalAlbum:  string
  originalGenre:  string
}

// ── Helpers ──

function formatMs(ms: number): string {
  const sec = Math.round(ms / 1000)
  const m   = Math.floor(sec / 60)
  const s   = sec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024)        return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / 1024 / 1024).toFixed(1) + " MB"
}

function adaptApiTrack(t: APITrack): Track {
  return {
    id:             t.id,
    path:           t.path,
    title:          t.title  || t.path.split("/").pop()?.replace(/\.[^.]+$/, "") || t.path,
    artist:         t.artist || "",
    album:          t.album  || "",
    genre:          t.genre  || "",
    duration:       formatMs(t.duration_ms),
    durationSec:    Math.round(t.duration_ms / 1000),
    bitrate:        t.bitrate_kbps ? `${t.bitrate_kbps} kbps` : "",
    size:           t.size_bytes   ? fmtBytes(t.size_bytes)   : "",
    folder:         t.folder || t.path.split("/").slice(0, -1).join("/"),
    dateAdded:      t.added_at.slice(0, 10),
    hasOverride:    !!t.has_override,
    originalTitle:  t.original_title  || "",
    originalArtist: t.original_artist || "",
    originalAlbum:  t.original_album  || "",
    originalGenre:  t.original_genre  || "",
  }
}

// ── File Upload Modal ─────────────────────────────────────────────────────────

const ALLOWED_AUDIO_EXTS = [".mp3", ".flac", ".ogg", ".wav", ".aac", ".m4a", ".opus"]

function FileUploadModal({
  open,
  onClose,
  onDone,
}: {
  open:    boolean
  onClose: () => void
  onDone:  () => void
}) {
  const [files, setFiles]       = React.useState<File[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [results, setResults]   = React.useState<APIUploadResult["uploaded"] | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const reset = () => {
    setFiles([])
    setUploading(false)
    setProgress(0)
    setResults(null)
    setDragOver(false)
  }

  const handleClose = () => { reset(); onClose() }

  const addFiles = (incoming: FileList | File[]) => {
    const filtered = Array.from(incoming).filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase()
      return ALLOWED_AUDIO_EXTS.includes(ext)
    })
    if (filtered.length === 0) {
      toast.error("No supported audio files selected")
      return
    }
    setFiles((prev) => {
      const paths = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...filtered.filter((f) => !paths.has(f.name + f.size))]
    })
    setResults(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  const handleUpload = async () => {
    if (!files.length) return
    setUploading(true)
    setProgress(0)
    try {
      const result = await api.library.upload(files, setProgress)
      setResults(result.uploaded)
      const successes = result.uploaded.filter((r) => !r.error).length
      if (successes > 0) {
        toast.success(`${successes} file${successes > 1 ? "s" : ""} uploaded`)
        onDone()
      }
      const failures = result.uploaded.filter((r) => r.error).length
      if (failures > 0) toast.error(`${failures} file${failures > 1 ? "s" : ""} failed`)
    } catch (err: unknown) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Audio Files
          </DialogTitle>
          <DialogDescription>
            Supported: MP3, FLAC, OGG, WAV, AAC, M4A, Opus
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-3">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".mp3,.flac,.ogg,.wav,.aac,.m4a,.opus,audio/*"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
                className="hidden"
              />
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Multiple files supported</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border divide-y text-sm">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <Music2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{fmtBytes(f.size)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Progress */}
            {uploading && (
              <div className="space-y-1">
                <Progress value={progress} />
                <p className="text-xs text-center text-muted-foreground">
                  Uploading… {progress}%
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Results */
          <div className="max-h-64 overflow-y-auto rounded border divide-y text-sm">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                {r.error
                  ? <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                  : <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                <span className="flex-1 truncate">{r.name}</span>
                {r.error && (
                  <span className="text-xs text-destructive flex-shrink-0">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={uploading}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button onClick={handleUpload} disabled={!files.length || uploading}>
              {uploading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />
                  Upload{files.length > 0 ? ` ${files.length} file${files.length > 1 ? "s" : ""}` : ""}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── YouTube Import Modal ──────────────────────────────────────────────────────

type ModalStep = "input" | "preview" | "importing"

function YouTubeImportModal({
  open,
  onClose,
  onImportStarted,
}: {
  open:             boolean
  onClose:          () => void
  onImportStarted:  (jobId: string) => void
}) {
  const [step, setStep]           = React.useState<ModalStep>("input")
  const [url, setUrl]             = React.useState("")
  const [loading, setLoading]     = React.useState(false)
  const [preview, setPreview]     = React.useState<{ type: string; title: string; items: APIImportItem[] } | null>(null)
  const [selected, setSelected]   = React.useState<Set<string>>(new Set())

  const reset = () => {
    setStep("input")
    setUrl("")
    setLoading(false)
    setPreview(null)
    setSelected(new Set())
  }

  const handleClose = () => { reset(); onClose() }

  const handlePreview = async () => {
    if (!url.trim()) return
    setLoading(true)
    try {
      const result = await api.library.ytPreview(url.trim())
      setPreview(result)
      setSelected(new Set(result.items.map((i) => i.ytid)))
      setStep("preview")
    } catch (err: unknown) {
      toast.error(`Preview failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!preview) return
    const items = preview.items.filter((i) => selected.has(i.ytid))
    if (items.length === 0) {
      toast.error("Select at least one track")
      return
    }
    setStep("importing")
    try {
      const { job_id } = await api.library.ytImport({ items })
      onImportStarted(job_id)
      handleClose()
      toast.success(`Importing ${items.length} track${items.length > 1 ? "s" : ""}…`)
    } catch (err: unknown) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      setStep("preview")
    }
  }

  const toggleAll = (checked: boolean) => {
    if (!preview) return
    setSelected(checked ? new Set(preview.items.map((i) => i.ytid)) : new Set())
  }

  const toggleItem = (ytid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(ytid) ? next.delete(ytid) : next.add(ytid)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className={`${step === "preview" && preview?.type === "playlist" ? "max-w-3xl" : "max-w-2xl"} max-h-[80vh] flex flex-col`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <YtIcon className="h-5 w-5 text-red-500" />
            Import from YouTube
          </DialogTitle>
          <DialogDescription>
            {step === "input"
              ? "Paste a YouTube video or playlist URL"
              : step === "preview"
              ? preview?.type === "playlist"
                ? `Playlist · ${preview.items.length} tracks — select which to download`
                : "Video preview — confirm to download"
              : "Starting download…"}
          </DialogDescription>
        </DialogHeader>

        {/* ── URL input step ── */}
        {step === "input" && (
          <div className="space-y-3 py-2">
            <Input
              placeholder="https://www.youtube.com/watch?v=… or /playlist?list=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePreview()}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              For personal use only. Downloading copyrighted content may violate
              YouTube&apos;s{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Terms of Service
              </a>
              . Only download content you own or have permission to use.
            </p>
          </div>
        )}

        {/* ── Preview step ── */}
        {step === "preview" && preview && (
          <div className="flex flex-col gap-3 overflow-hidden">
            {preview.type === "playlist" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  id="select-all"
                  checked={selected.size === preview.items.length}
                  onCheckedChange={(v) => toggleAll(!!v)}
                />
                <label htmlFor="select-all" className="cursor-pointer">
                  Select all ({selected.size} / {preview.items.length})
                </label>
              </div>
            )}
            <div className="overflow-y-auto rounded-md border divide-y max-h-[50vh]">
              {preview.items.map((item) => (
                <div key={item.ytid} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                  {preview.type === "playlist" && (
                    <Checkbox
                      checked={selected.has(item.ytid)}
                      onCheckedChange={() => toggleItem(item.ytid)}
                    />
                  )}
                  {item.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-10 w-16 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.artist}</p>
                  </div>
                  {item.duration_ms > 0 && (
                    <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                      {formatMs(item.duration_ms)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Importing step ── */}
        {step === "importing" && (
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Starting download…</span>
          </div>
        )}

        <DialogFooter className="mt-auto pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={loading || step === "importing"}>
            Cancel
          </Button>
          {step === "input" && (
            <Button onClick={handlePreview} disabled={!url.trim() || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <YtIcon className="mr-2 h-4 w-4" />}
              {loading ? "Loading…" : "Preview"}
            </Button>
          )}
          {step === "preview" && (
            <Button onClick={handleImport} disabled={selected.size === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Download {selected.size} track{selected.size !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit Track Dialog ─────────────────────────────────────────────────────────

function EditTrackDialog({
  track,
  onClose,
  onSaved,
}: {
  track:   Track | null
  onClose: () => void
  onSaved: (updated: Track) => void
}) {
  const [title,  setTitle]  = React.useState("")
  const [artist, setArtist] = React.useState("")
  const [album,  setAlbum]  = React.useState("")
  const [genre,  setGenre]  = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (track) {
      setTitle(track.title)
      setArtist(track.artist)
      setAlbum(track.album)
      setGenre(track.genre)
    }
  }, [track])

  const handleSave = async () => {
    if (!track) return
    setSaving(true)
    try {
      const updated = await api.library.update(track.id, { title, artist, album, genre })
      onSaved(adaptApiTrack(updated))
      toast.success("Track updated")
      onClose()
    } catch (err: unknown) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!track) return
    setSaving(true)
    try {
      const reverted = await api.library.resetOverride(track.id)
      onSaved(adaptApiTrack(reverted))
      toast.success("Reverted to file metadata")
      onClose()
    } catch (err: unknown) {
      toast.error(`Failed to reset: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault()
      handleSave()
    }
  }

  const fields = [
    { label: "Title",  value: title,  set: setTitle,  original: track?.originalTitle  ?? "" },
    { label: "Artist", value: artist, set: setArtist, original: track?.originalArtist ?? "" },
    { label: "Album",  value: album,  set: setAlbum,  original: track?.originalAlbum  ?? "" },
    { label: "Genre",  value: genre,  set: setGenre,  original: track?.originalGenre  ?? "" },
  ] as const

  return (
    <Dialog open={!!track} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Edit Track</DialogTitle>
          <DialogDescription className="truncate text-xs font-mono">
            {track?.path.split("/").pop()}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          {fields.map(({ label, value, set, original }) => (
            <div key={label} className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">{label}</label>
              <Input
                value={value}
                onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              {track?.hasOverride && original && original !== value && (
                <p className="text-[10.5px] text-muted-foreground font-mono truncate">
                  Original: {original}
                </p>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          {track?.hasOverride && (
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={saving}
              className="mr-auto"
              title="Discard overrides and restore file's ID3 metadata"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to file
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Active Jobs Panel ─────────────────────────────────────────────────────────

function JobStatusIcon({ status }: { status: string }) {
  if (status === "done")       return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === "error")      return <XCircle className="h-4 w-4 text-destructive" />
  if (status === "downloading") return <Loader2 className="h-4 w-4 animate-spin text-primary" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

function ActiveJobs({ onAllDone }: { onAllDone: () => void }) {
  const [jobs, setJobs] = React.useState<APIImportJob[]>([])
  const hadJobsRef = React.useRef(false)

  React.useEffect(() => {
    const poll = async () => {
      try {
        const all = await api.library.importJobs()
        const active = all.filter((j) => j.status === "downloading" || j.status === "pending")
        setJobs(active)

        if (active.length === 0 && hadJobsRef.current) {
          hadJobsRef.current = false
          onAllDone()
        } else if (active.length > 0) {
          hadJobsRef.current = true
        }
      } catch {
        // ignore poll errors
      }
    }

    poll()
    const timer = setInterval(poll, 1500)
    return () => clearInterval(timer)
  }, [onAllDone])

  if (jobs.length === 0) return null

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <Card key={job.id} className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            {job.items.map((item) => (
              <div key={item.ytid} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <JobStatusIcon status={item.status} />
                  <span className="flex-1 truncate font-medium">{item.title}</span>
                  {item.status === "downloading" && (
                    <span className="text-muted-foreground">{Math.round(item.progress)}%</span>
                  )}
                </div>
                {item.status === "downloading" && (
                  <Progress value={item.progress} className="h-1" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function LibraryPage() {
  const [tracks, setTracks]           = React.useState<Track[]>([])
  const [loading, setLoading]         = React.useState(true)
  const [scanning, setScanning]       = React.useState(false)
  const [search, setSearch]           = React.useState("")
  const [genreFilter, setGenreFilter] = React.useState("all")
  const [page, setPage]               = React.useState(1)
  const [editTrack, setEditTrack]     = React.useState<Track | null>(null)
  const [ytOpen, setYtOpen]             = React.useState(false)
  const [uploadOpen, setUploadOpen]     = React.useState(false)

  const genres = React.useMemo(
    () => [...new Set(tracks.map((t) => t.genre))].filter(Boolean).sort(),
    [tracks],
  )

  const loadTracks = React.useCallback(() => {
    setLoading(true)
    api.library.list()
      .then((ts) => setTracks(ts.map(adaptApiTrack)))
      .catch((err) => toast.error(`Failed to load library: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { loadTracks() }, [loadTracks])

  const handleScan = () => {
    setScanning(true)
    api.library.scan()
      .then(() => {
        toast.success("Scan started — refreshing in 3s")
        setTimeout(() => {
          loadTracks()
          setScanning(false)
        }, 3000)
      })
      .catch((err) => {
        toast.error(`Scan failed: ${err.message}`)
        setScanning(false)
      })
  }

  const handleImportStarted = () => {
    // ActiveJobs polls automatically — no need to track job IDs manually
  }

  const handleAllJobsDone = React.useCallback(() => {
    setTimeout(() => {
      loadTracks()
    }, 1500)
  }, [loadTracks])

  const filtered = tracks.filter((t) => {
    if (search && ![t.title, t.artist, t.album].some((f) => f.toLowerCase().includes(search.toLowerCase()))) return false
    if (genreFilter !== "all" && t.genre !== genreFilter) return false
    return true
  })

  React.useEffect(() => { setPage(1) }, [search, genreFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalDuration = filtered.reduce((sum, t) => sum + t.durationSec, 0)
  const fmtTotal = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Library</h1>
          <p className="text-[12.5px] text-ink-400 mt-1">Music files available for playlists and AutoDJ</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleScan} disabled={scanning}>
            <FolderOpen className="mr-1.5 h-4 w-4" />
            {scanning ? "Scanning…" : "Scan Folder"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Music
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setYtOpen(true)}>
                <YtIcon className="mr-2 h-4 w-4 text-red-500" />
                Import from YouTube
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active download jobs */}
      <ActiveJobs onAllDone={handleAllJobsDone} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, artist, album…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={genreFilter} onValueChange={setGenreFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Genre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genres</SelectItem>
            {genres.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="px-2.5 py-1 text-xs">
          {filtered.length} tracks · {fmtTotal(totalDuration)}
        </Badge>
      </div>

      <div className="border-t border-ink-800">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Music2 className="h-10 w-10 opacity-20 animate-pulse" />
              <p className="text-sm">Loading library…</p>
            </div>
          ) : tracks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <Music2 className="h-12 w-12 opacity-20" />
              <p className="text-sm">No tracks in library</p>
              <p className="text-xs text-center">
                Upload audio files directly, or drop them into{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">server/data/music/</code> and click Scan.
              </p>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload Files
                </Button>
                <Button variant="outline" size="sm" onClick={() => setYtOpen(true)}>
                  <YtIcon className="mr-1.5 h-3.5 w-3.5" />
                  Import from YouTube
                </Button>
                <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {scanning ? "Scanning…" : "Scan Folder"}
                </Button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Music2 className="h-10 w-10 opacity-20" />
              <p className="text-sm">No tracks match your filters</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Artist</TableHead>
                    <TableHead>Album</TableHead>
                    <TableHead>Genre</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Bitrate</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((track, i) => (
                    <TableRow key={track.path} className="group">
                      <TableCell className="text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                      <TableCell className="font-medium max-w-[180px] truncate">{track.title}</TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">{track.artist || <span className="text-muted-foreground/40">—</span>}</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate text-muted-foreground">{track.album || "—"}</TableCell>
                      <TableCell>
                        {track.genre ? <Badge variant="outline" className="text-[10px]">{track.genre}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{track.duration}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{track.bitrate || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{track.size || "—"}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => setEditTrack(track)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-ink-100"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-ink-800 px-2 py-3">
                  <span className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} track
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setPage((p) => p - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums px-1">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      <FileUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onDone={() => setTimeout(loadTracks, 1500)}
      />

      <YouTubeImportModal
        open={ytOpen}
        onClose={() => setYtOpen(false)}
        onImportStarted={handleImportStarted}
      />

      <EditTrackDialog
        track={editTrack}
        onClose={() => setEditTrack(null)}
        onSaved={(updated) => setTracks((prev) => prev.map((t) => t.id === updated.id ? updated : t))}
      />
    </div>
  )
}
