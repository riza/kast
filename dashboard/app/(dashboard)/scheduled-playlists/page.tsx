"use client"

import * as React from "react"
import {
  CalendarClock, Plus, Pencil, Trash2, Check, X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  api,
  type APISchedule, type CreateScheduleBody, type UpdateScheduleBody,
  type APIMount, type APIPlaylist,
} from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// ── Day-of-week helpers ───────────────────────────────────────────────────────
//
// Bit ordering matches Go's time.Weekday: bit 0 = Sunday … bit 6 = Saturday.
// The UI shows Mon-first for European readability but the bit math respects
// the server convention.

type Day = { bit: number; short: string; long: string }

const DAYS: Day[] = [
  { bit: 1, short: "S", long: "Sun" },
  { bit: 2, short: "M", long: "Mon" },
  { bit: 4, short: "T", long: "Tue" },
  { bit: 8, short: "W", long: "Wed" },
  { bit: 16, short: "T", long: "Thu" },
  { bit: 32, short: "F", long: "Fri" },
  { bit: 64, short: "S", long: "Sat" },
]

// Mon-Fri preset for the common "weekdays" case.
const WEEKDAY_MASK = 0b00111110

function daysMaskLabel(mask: number): string {
  if (mask === 0x7F) return "Every day"
  if (mask === WEEKDAY_MASK) return "Mon–Fri"
  if (mask === 0b01000001) return "Weekends"
  return DAYS.filter(d => mask & d.bit).map(d => d.long).join(", ")
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0")
  const mm = (m % 60).toString().padStart(2, "0")
  return `${h}:${mm}`
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

// ── Form ──────────────────────────────────────────────────────────────────────

type FormState = {
  name:     string
  mount:    string
  playlist: string
  daysMask: number
  start:    string  // HH:MM
  end:      string
  enabled:  boolean
}

function defaultForm(s?: APISchedule, mounts?: APIMount[], playlists?: APIPlaylist[]): FormState {
  if (!s) {
    return {
      name:     "",
      mount:    mounts?.[0]?.name ?? "",
      playlist: playlists?.[0]?.id ?? "",
      daysMask: WEEKDAY_MASK,
      start:    "06:00",
      end:      "10:00",
      enabled:  true,
    }
  }
  return {
    name:     s.name,
    mount:    s.mount,
    playlist: s.playlist_id,
    daysMask: s.days_mask,
    start:    minutesToHHMM(s.start_minutes),
    end:      minutesToHHMM(s.end_minutes),
    enabled:  s.enabled,
  }
}

function ScheduleDialog({
  open, onClose, existing, mounts, playlists, onSaved,
}: {
  open:      boolean
  onClose:   () => void
  existing?: APISchedule
  mounts:    APIMount[]
  playlists: APIPlaylist[]
  onSaved:   (s: APISchedule) => void
}) {
  const [form, setForm] = React.useState<FormState>(() => defaultForm(existing, mounts, playlists))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setForm(defaultForm(existing, mounts, playlists))
  }, [open, existing, mounts, playlists])

  function toggleDay(bit: number) {
    setForm(f => ({ ...f, daysMask: f.daysMask ^ bit }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!form.mount || !form.playlist) {
      toast.error("Mount and playlist are required")
      return
    }
    if (form.daysMask === 0) {
      toast.error("Select at least one day")
      return
    }
    const startMin = hhmmToMinutes(form.start)
    const endMin = hhmmToMinutes(form.end)
    if (endMin <= startMin) {
      toast.error("End time must be after start time (midnight crossing is not supported)")
      return
    }

    setSaving(true)
    try {
      let saved: APISchedule
      if (existing) {
        const body: UpdateScheduleBody = {
          name:          form.name.trim(),
          mount:         form.mount,
          playlist_id:   form.playlist,
          days_mask:     form.daysMask,
          start_minutes: startMin,
          end_minutes:   endMin,
          enabled:       form.enabled,
        }
        saved = await api.schedules.update(existing.id, body)
      } else {
        const body: CreateScheduleBody = {
          name:          form.name.trim(),
          mount:         form.mount,
          playlist_id:   form.playlist,
          days_mask:     form.daysMask,
          start_minutes: startMin,
          end_minutes:   endMin,
          enabled:       form.enabled,
        }
        saved = await api.schedules.create(body)
      }
      toast.success(existing ? "Schedule updated" : "Schedule created")
      onSaved(saved)
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg bg-ink-950 border-ink-800 text-ink-100">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold">
            {existing ? "Edit schedule" : "Add schedule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-ink-400 font-mono">Name</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Morning Mix"
              className="text-[13px] bg-ink-900 border-ink-700 text-ink-100 placeholder:text-ink-600"
            />
          </div>

          {/* Mount + Playlist */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-ink-400 font-mono">Mount</Label>
              <Select value={form.mount} onValueChange={v => setForm(f => ({ ...f, mount: v }))}>
                <SelectTrigger className="text-[13px] bg-ink-900 border-ink-700 text-ink-100">
                  <SelectValue placeholder="Select mount" />
                </SelectTrigger>
                <SelectContent className="bg-ink-950 border-ink-800 text-ink-100">
                  {mounts.map(m => (
                    <SelectItem key={m.name} value={m.name} className="text-[13px] font-mono">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-ink-400 font-mono">Playlist</Label>
              <Select value={form.playlist} onValueChange={v => setForm(f => ({ ...f, playlist: v }))}>
                <SelectTrigger className="text-[13px] bg-ink-900 border-ink-700 text-ink-100">
                  <SelectValue placeholder="Select playlist" />
                </SelectTrigger>
                <SelectContent className="bg-ink-950 border-ink-800 text-ink-100">
                  {playlists.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-[13px]">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Days */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] text-ink-400 font-mono">Days</Label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, daysMask: WEEKDAY_MASK }))}
                  className="text-[11px] text-ink-500 hover:text-ink-300 font-mono"
                >
                  Mon–Fri
                </button>
                <span className="text-ink-700">·</span>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, daysMask: 0x7F }))}
                  className="text-[11px] text-ink-500 hover:text-ink-300 font-mono"
                >
                  Every day
                </button>
              </div>
            </div>
            <div className="flex gap-1">
              {DAYS.map(d => {
                const selected = (form.daysMask & d.bit) !== 0
                return (
                  <button
                    key={d.bit}
                    type="button"
                    onClick={() => toggleDay(d.bit)}
                    title={d.long}
                    className={cn(
                      "flex-1 h-9 rounded text-[12px] font-mono border transition-colors",
                      selected
                        ? "bg-k-500/15 border-k-500/40 text-k-400"
                        : "bg-ink-900 border-ink-700 text-ink-500 hover:border-ink-600 hover:text-ink-300",
                    )}
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-ink-400 font-mono">Start</Label>
              <Input
                type="time"
                value={form.start}
                onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                className="font-mono text-[13px] bg-ink-900 border-ink-700 text-ink-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-ink-400 font-mono">End</Label>
              <Input
                type="time"
                value={form.end}
                onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
                className="font-mono text-[13px] bg-ink-900 border-ink-700 text-ink-100"
              />
            </div>
          </div>
          <p className="text-[11px] text-ink-600">
            End must be after start. Midnight crossing is not supported — create two entries for overnight blocks.
          </p>

          {/* Enabled */}
          <div className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900/30 px-3 py-2.5">
            <div>
              <p className="text-[12.5px] font-medium text-ink-200">Enabled</p>
              <p className="text-[11px] text-ink-500">Disabled schedules never fire</p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12.5px] text-ink-400 hover:text-ink-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12.5px] font-medium bg-k-500 text-white hover:bg-k-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {existing ? "Save changes" : "Create schedule"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Day badges (compact row display) ─────────────────────────────────────────

function DayBadges({ mask }: { mask: number }) {
  return (
    <span className="flex gap-0.5">
      {DAYS.map(d => {
        const on = (mask & d.bit) !== 0
        return (
          <span
            key={d.bit}
            title={d.long}
            className={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono border",
              on
                ? "bg-k-500/15 border-k-500/30 text-k-400"
                : "bg-ink-900/50 border-ink-800 text-ink-700",
            )}
          >
            {d.short}
          </span>
        )
      })}
    </span>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ScheduleRow({
  s, playlistName, onToggle, onEdit, onDelete,
}: {
  s:            APISchedule
  playlistName: string
  onToggle:     (s: APISchedule) => void
  onEdit:       (s: APISchedule) => void
  onDelete:     (s: APISchedule) => void
}) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_minmax(0,1.4fr)_1fr_80px_80px] gap-4 px-4 py-3.5 items-center border-b border-ink-800/60 last:border-0">
      {/* Name */}
      <div className="min-w-0 flex items-center gap-2">
        <span
          className={cn(
            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
            s.enabled ? "bg-emerald-500" : "bg-ink-600",
          )}
        />
        <span className="text-[12.5px] text-ink-100 truncate" title={s.name}>{s.name}</span>
      </div>

      {/* Mount */}
      <div className="font-mono text-[12px] text-ink-300 truncate" title={s.mount}>{s.mount}</div>

      {/* Days */}
      <div className="flex flex-col gap-0.5">
        <DayBadges mask={s.days_mask} />
        <span className="text-[10.5px] text-ink-600 font-mono">{daysMaskLabel(s.days_mask)}</span>
      </div>

      {/* Time + playlist */}
      <div className="min-w-0">
        <div className="font-mono text-[12.5px] text-ink-200">
          {minutesToHHMM(s.start_minutes)}–{minutesToHHMM(s.end_minutes)}
        </div>
        <div className="text-[11px] text-ink-500 truncate" title={playlistName}>{playlistName}</div>
      </div>

      {/* Enabled toggle */}
      <div className="flex justify-center">
        <Switch checked={s.enabled} onCheckedChange={() => onToggle(s)} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => onEdit(s)}
          title="Edit"
          className="h-7 w-7 rounded hover:bg-ink-800 text-ink-500 hover:text-ink-200 flex items-center justify-center transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(s)}
          title="Delete"
          className="h-7 w-7 rounded hover:bg-red-500/10 text-ink-500 hover:text-red-400 flex items-center justify-center transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScheduledPlaylistsPage() {
  const [schedules,    setSchedules]    = React.useState<APISchedule[] | null>(null)
  const [mounts,       setMounts]       = React.useState<APIMount[]>([])
  const [playlists,    setPlaylists]    = React.useState<APIPlaylist[]>([])
  const [error,        setError]        = React.useState<string | null>(null)
  const [dialogOpen,   setDialogOpen]   = React.useState(false)
  const [editTarget,   setEditTarget]   = React.useState<APISchedule | undefined>()
  const [deleteTarget, setDeleteTarget] = React.useState<APISchedule | undefined>()
  const [deleting,     setDeleting]     = React.useState(false)

  async function load() {
    try {
      const [ss, ms, ps] = await Promise.all([
        api.schedules.list(),
        api.mounts.list(),
        api.playlists.list(),
      ])
      setSchedules(ss ?? [])
      setMounts(ms ?? [])
      setPlaylists(ps ?? [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load schedules")
    }
  }

  React.useEffect(() => { load() }, [])

  const playlistName = React.useCallback(
    (id: string) => playlists.find(p => p.id === id)?.name ?? id,
    [playlists],
  )

  function openCreate() {
    setEditTarget(undefined)
    setDialogOpen(true)
  }

  function openEdit(s: APISchedule) {
    setEditTarget(s)
    setDialogOpen(true)
  }

  function handleSaved(s: APISchedule) {
    setSchedules(prev => {
      if (!prev) return [s]
      const idx = prev.findIndex(x => x.id === s.id)
      if (idx === -1) return [...prev, s]
      const next = [...prev]
      next[idx] = s
      return next
    })
  }

  async function handleToggle(s: APISchedule) {
    try {
      const updated = await api.schedules.update(s.id, { enabled: !s.enabled })
      setSchedules(prev => prev?.map(x => x.id === updated.id ? updated : x) ?? [])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.schedules.delete(deleteTarget.id)
      setSchedules(prev => prev?.filter(x => x.id !== deleteTarget.id) ?? [])
      toast.success("Schedule deleted")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeleting(false)
      setDeleteTarget(undefined)
    }
  }

  const isLoading = schedules === null && !error

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Schedules</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {schedules !== null
              ? `${schedules.length} schedule${schedules.length !== 1 ? "s" : ""} configured`
              : "Day-parting for your mounts — auto-play a playlist during a weekly window"}
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={mounts.length === 0 || playlists.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-k-500 text-white hover:bg-k-600 disabled:opacity-50 transition-colors shrink-0"
          title={mounts.length === 0 ? "Create a mount first" : playlists.length === 0 ? "Create a playlist first" : ""}
        >
          <Plus className="h-3.5 w-3.5" />
          Add schedule
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12.5px] text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="border-t border-ink-800 py-16 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && schedules?.length === 0 && (
        <div className="border-t border-ink-800 flex flex-col items-center gap-3 py-16">
          <CalendarClock className="h-10 w-10 text-ink-700" />
          <p className="text-[13px] text-ink-500">No schedules configured</p>
          <p className="text-[12px] text-ink-600 text-center max-w-sm">
            Schedules automatically start a playlist on a mount during a recurring weekly time window — perfect for day-parting (Morning Mix, Evening Jazz, etc.).
          </p>
          <button
            onClick={openCreate}
            disabled={mounts.length === 0 || playlists.length === 0}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded text-[12.5px] font-medium border border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your first schedule
          </button>
        </div>
      )}

      {/* Table */}
      {!isLoading && schedules && schedules.length > 0 && (
        <div className="border border-ink-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_minmax(0,1.4fr)_1fr_80px_80px] gap-4 px-4 py-2 bg-ink-900/60 border-b border-ink-800 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono">
            <div>Name</div>
            <div>Mount</div>
            <div>Days</div>
            <div>Window</div>
            <div className="text-center">Active</div>
            <div />
          </div>
          {schedules.map(s => (
            <ScheduleRow
              key={s.id}
              s={s}
              playlistName={playlistName(s.playlist_id)}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Info strip */}
      {!isLoading && schedules !== null && (
        <div className="mt-8 rounded-lg border border-ink-800/60 bg-ink-900/30 px-4 py-3.5 space-y-2">
          <p className="text-[11.5px] font-semibold text-ink-400 font-mono uppercase tracking-wider">How schedules work</p>
          <div className="space-y-1 text-[12px] text-ink-500">
            <p>Every few seconds the runner checks the current minute (in the server timezone) against each enabled schedule.</p>
            <p>When a window opens it starts the playlist on the mount — replacing whatever was playing. When the window closes the mount stops.</p>
            <p>Windows on the same mount and overlapping days cannot intersect; the API rejects conflicting entries.</p>
          </div>
        </div>
      )}

      {/* Create / edit dialog */}
      <ScheduleDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        existing={editTarget}
        mounts={mounts}
        playlists={playlists}
        onSaved={handleSaved}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(undefined)}>
        <AlertDialogContent className="bg-ink-950 border-ink-800 text-ink-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Delete schedule?</AlertDialogTitle>
            <AlertDialogDescription className="text-ink-400 text-[12.5px]">
              <span className="font-mono text-ink-300">{deleteTarget?.name}</span>
              <br />
              This schedule will stop firing immediately. Any session it started will be stopped at the next tick.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100 text-[12.5px]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 text-[12.5px] flex items-center gap-1.5"
            >
              {deleting
                ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                : <X className="h-3.5 w-3.5" />
              }
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
