"use client"

import * as React from "react"
import {
  Webhook, Plus, Pencil, Trash2, Lock, Eye, EyeOff, Check, X,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { api, type APIWebhook, type CreateWebhookBody, type UpdateWebhookBody } from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// ── Event catalogue ───────────────────────────────────────────────────────────

type EventGroup = { label: string; events: string[] }

const EVENT_GROUPS: EventGroup[] = [
  {
    label: "Mount",
    events: ["mount.created", "mount.deleted", "mount.status.changed", "mount.metadata.updated"],
  },
  {
    label: "AutoDJ",
    events: ["autodj.started", "autodj.stopped", "autodj.track.changed", "autodj.track.skipped"],
  },
  {
    label: "Playlist",
    events: ["playlist.created", "playlist.updated", "playlist.deleted"],
  },
  {
    label: "Schedule",
    events: ["schedule.created", "schedule.updated", "schedule.deleted", "schedule.triggered", "schedule.ended", "schedule.skipped"],
  },
  {
    label: "Stream",
    events: ["listener.count.changed"],
  },
]

const ALL_EVENTS = EVENT_GROUPS.flatMap(g => g.events)

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname === "/" ? "" : u.pathname
    return u.host + path
  } catch {
    return url
  }
}

function eventLabel(e: string): string {
  return e.split(".").slice(1).join(".")
}

// ── Event badges ─────────────────────────────────────────────────────────────

function EventBadges({ events }: { events: string[] }) {
  if (events.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-mono bg-k-500/15 text-k-400 border border-k-500/25">
        all events
      </span>
    )
  }

  const MAX = 3
  const visible = events.slice(0, MAX)
  const rest = events.length - MAX

  return (
    <span className="flex flex-wrap gap-1">
      {visible.map(e => (
        <span
          key={e}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-ink-800 text-ink-400 border border-ink-700"
        >
          {e}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
          +{rest}
        </span>
      )}
    </span>
  )
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────

type WebhookFormState = {
  url:       string
  allEvents: boolean
  events:    Set<string>
  secret:    string
  enabled:   boolean
}

function defaultForm(wh?: APIWebhook): WebhookFormState {
  if (!wh) {
    return { url: "", allEvents: true, events: new Set(ALL_EVENTS), secret: "", enabled: true }
  }
  const allEvents = wh.events.length === 0
  return {
    url:       wh.url,
    allEvents,
    events:    new Set(allEvents ? ALL_EVENTS : wh.events),
    secret:    "",
    enabled:   wh.enabled,
  }
}

function WebhookDialog({
  open,
  onClose,
  existing,
  onSaved,
}: {
  open:      boolean
  onClose:   () => void
  existing?: APIWebhook
  onSaved:   (wh: APIWebhook) => void
}) {
  const [form,    setForm]    = React.useState<WebhookFormState>(() => defaultForm(existing))
  const [saving,  setSaving]  = React.useState(false)
  const [showKey, setShowKey] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setForm(defaultForm(existing))
      setShowKey(false)
    }
  }, [open, existing])

  function toggleEvent(e: string) {
    setForm(f => {
      const next = new Set(f.events)
      next.has(e) ? next.delete(e) : next.add(e)
      return { ...f, events: next }
    })
  }

  function toggleGroup(group: EventGroup) {
    setForm(f => {
      const allSelected = group.events.every(e => f.events.has(e))
      const next = new Set(f.events)
      if (allSelected) {
        group.events.forEach(e => next.delete(e))
      } else {
        group.events.forEach(e => next.add(e))
      }
      return { ...f, events: next }
    })
  }

  async function handleSave() {
    if (!form.url.trim()) {
      toast.error("URL is required")
      return
    }
    setSaving(true)
    try {
      const events = form.allEvents ? [] : [...form.events]
      let wh: APIWebhook
      if (existing) {
        const body: UpdateWebhookBody = { url: form.url.trim(), events, enabled: form.enabled }
        if (form.secret) body.secret = form.secret
        wh = await api.webhooks.update(existing.id, body)
      } else {
        const body: CreateWebhookBody = { url: form.url.trim(), events, enabled: form.enabled }
        if (form.secret) body.secret = form.secret
        wh = await api.webhooks.create(body)
      }
      toast.success(existing ? "Webhook updated" : "Webhook created")
      onSaved(wh)
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
            {existing ? "Edit webhook" : "Add webhook"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* URL */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-ink-400 font-mono">Endpoint URL</Label>
            <Input
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              placeholder="https://example.com/webhook"
              className="font-mono text-[13px] bg-ink-900 border-ink-700 text-ink-100 placeholder:text-ink-600"
            />
          </div>

          {/* Signing secret */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-ink-400 font-mono">
              Signing secret{" "}
              <span className="text-ink-600">(optional)</span>
            </Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={form.secret}
                onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                placeholder={existing?.secret ? "Leave blank to keep current" : "Used for X-Kast-Signature header"}
                className="font-mono text-[13px] bg-ink-900 border-ink-700 text-ink-100 placeholder:text-ink-600 pr-9"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] text-ink-400 font-mono">Events</Label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-[11.5px] text-ink-500 font-mono">All events</span>
                <Switch
                  checked={form.allEvents}
                  onCheckedChange={v => setForm(f => ({ ...f, allEvents: v }))}
                />
              </label>
            </div>

            {!form.allEvents && (
              <div className="rounded-lg border border-ink-800 bg-ink-900/50 divide-y divide-ink-800/60">
                {EVENT_GROUPS.map(group => {
                  const allChecked = group.events.every(e => form.events.has(e))
                  const someChecked = group.events.some(e => form.events.has(e))
                  return (
                    <div key={group.label} className="px-3 py-2.5">
                      <label className="flex items-center gap-2.5 cursor-pointer mb-2">
                        <Checkbox
                          checked={allChecked}
                          ref={el => {
                            if (el) (el as HTMLButtonElement).dataset.indeterminate = (!allChecked && someChecked) ? "true" : "false"
                          }}
                          className={cn(
                            "border-ink-600 data-[state=checked]:bg-k-500 data-[state=checked]:border-k-500",
                            !allChecked && someChecked && "opacity-60"
                          )}
                          onCheckedChange={() => toggleGroup(group)}
                        />
                        <span className="text-[11.5px] font-semibold text-ink-300 uppercase tracking-wider font-mono">
                          {group.label}
                        </span>
                      </label>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-[26px]">
                        {group.events.map(e => (
                          <label key={e} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={form.events.has(e)}
                              className="border-ink-600 data-[state=checked]:bg-k-500 data-[state=checked]:border-k-500"
                              onCheckedChange={() => toggleEvent(e)}
                            />
                            <span className="text-[11px] font-mono text-ink-400 truncate">{e}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900/30 px-3 py-2.5">
            <div>
              <p className="text-[12.5px] font-medium text-ink-200">Enabled</p>
              <p className="text-[11px] text-ink-500">Disabled webhooks receive no events</p>
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
            {existing ? "Save changes" : "Create webhook"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Webhook row ───────────────────────────────────────────────────────────────

function WebhookRow({
  wh,
  onToggle,
  onEdit,
  onDelete,
}: {
  wh:       APIWebhook
  onToggle: (wh: APIWebhook) => void
  onEdit:   (wh: APIWebhook) => void
  onDelete: (wh: APIWebhook) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,2fr)_80px_80px] gap-4 px-4 py-3.5 items-center border-b border-ink-800/60 last:border-0">
      {/* URL */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full shrink-0",
              wh.enabled ? "bg-emerald-500" : "bg-ink-600"
            )}
          />
          <span
            className="font-mono text-[12.5px] text-ink-100 truncate"
            title={wh.url}
          >
            {shortUrl(wh.url)}
          </span>
          {wh.secret && (
            <span title="Has signing secret">
              <Lock className="h-3 w-3 shrink-0 text-ink-600" />
            </span>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="min-w-0">
        <EventBadges events={wh.events} />
      </div>

      {/* Enabled toggle */}
      <div className="flex justify-center">
        <Switch
          checked={wh.enabled}
          onCheckedChange={() => onToggle(wh)}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => onEdit(wh)}
          title="Edit"
          className="h-7 w-7 rounded hover:bg-ink-800 text-ink-500 hover:text-ink-200 flex items-center justify-center transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(wh)}
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

export default function WebhooksPage() {
  const [webhooks,     setWebhooks]     = React.useState<APIWebhook[] | null>(null)
  const [error,        setError]        = React.useState<string | null>(null)
  const [dialogOpen,   setDialogOpen]   = React.useState(false)
  const [editTarget,   setEditTarget]   = React.useState<APIWebhook | undefined>()
  const [deleteTarget, setDeleteTarget] = React.useState<APIWebhook | undefined>()
  const [deleting,     setDeleting]     = React.useState(false)

  async function load() {
    try {
      const whs = await api.webhooks.list()
      setWebhooks(whs ?? [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load webhooks")
    }
  }

  React.useEffect(() => { load() }, [])

  function openCreate() {
    setEditTarget(undefined)
    setDialogOpen(true)
  }

  function openEdit(wh: APIWebhook) {
    setEditTarget(wh)
    setDialogOpen(true)
  }

  function handleSaved(wh: APIWebhook) {
    setWebhooks(prev => {
      if (!prev) return [wh]
      const idx = prev.findIndex(w => w.id === wh.id)
      if (idx === -1) return [...prev, wh]
      const next = [...prev]
      next[idx] = wh
      return next
    })
  }

  async function handleToggle(wh: APIWebhook) {
    try {
      const updated = await api.webhooks.update(wh.id, { enabled: !wh.enabled })
      setWebhooks(prev => prev?.map(w => w.id === updated.id ? updated : w) ?? [])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.webhooks.delete(deleteTarget.id)
      setWebhooks(prev => prev?.filter(w => w.id !== deleteTarget.id) ?? [])
      toast.success("Webhook deleted")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeleting(false)
      setDeleteTarget(undefined)
    }
  }

  const isLoading = webhooks === null && !error

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Webhooks</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {webhooks !== null
              ? `${webhooks.length} endpoint${webhooks.length !== 1 ? "s" : ""} configured`
              : "HTTP event delivery to external endpoints"}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-k-500 text-white hover:bg-k-600 transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Add webhook
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

      {/* Empty state */}
      {!isLoading && webhooks?.length === 0 && (
        <div className="border-t border-ink-800 flex flex-col items-center gap-3 py-16">
          <Webhook className="h-10 w-10 text-ink-700" />
          <p className="text-[13px] text-ink-500">No webhooks configured</p>
          <p className="text-[12px] text-ink-600 text-center max-w-sm">
            Webhooks deliver real-time POST requests to your endpoints when events occur — mount status changes, track changes, listener updates, and more.
          </p>
          <button
            onClick={openCreate}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded text-[12.5px] font-medium border border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your first webhook
          </button>
        </div>
      )}

      {/* Table */}
      {!isLoading && webhooks && webhooks.length > 0 && (
        <div className="border border-ink-800 rounded-lg overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_minmax(0,2fr)_80px_80px] gap-4 px-4 py-2 bg-ink-900/60 border-b border-ink-800 text-[10.5px] uppercase tracking-wider text-ink-500 font-mono">
            <div>Endpoint</div>
            <div>Events</div>
            <div className="text-center">Active</div>
            <div />
          </div>
          {webhooks.map(wh => (
            <WebhookRow
              key={wh.id}
              wh={wh}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Info strip */}
      {!isLoading && webhooks !== null && (
        <div className="mt-8 rounded-lg border border-ink-800/60 bg-ink-900/30 px-4 py-3.5 space-y-2">
          <p className="text-[11.5px] font-semibold text-ink-400 font-mono uppercase tracking-wider">Delivery details</p>
          <div className="space-y-1 text-[12px] text-ink-500">
            <p>Each event is sent as a <span className="font-mono text-ink-400">POST</span> with a JSON body: <span className="font-mono text-ink-400">{"{ id, event, timestamp, data }"}</span></p>
            <p>If a signing secret is set, a <span className="font-mono text-ink-400">X-Kast-Signature: sha256=…</span> header is included for verification.</p>
            <p>Events with empty filter receive all 12 event types. Delivery is async with a 10 s timeout.</p>
          </div>
        </div>
      )}

      {/* Create / edit dialog */}
      <WebhookDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        existing={editTarget}
        onSaved={handleSaved}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(undefined)}>
        <AlertDialogContent className="bg-ink-950 border-ink-800 text-ink-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Delete webhook?</AlertDialogTitle>
            <AlertDialogDescription className="text-ink-400 text-[12.5px]">
              <span className="font-mono text-ink-300">{deleteTarget?.url}</span>
              <br />
              This endpoint will stop receiving events immediately. This cannot be undone.
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
