"use client"

import * as React from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { api, type APISettings } from "@/lib/api"
import { SettingsContext } from "@/app/(dashboard)/layout"
import { ChevronsUpDown } from "lucide-react"

// ── Design primitives ──

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium text-ink-500 uppercase tracking-wider font-mono mb-3">
      {children}
    </h3>
  )
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] text-ink-300 font-medium">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-600">{hint}</p>}
    </div>
  )
}

const inputCls = "h-8 w-full bg-ink-950 border border-ink-800 rounded-md px-3 text-[12.5px] text-ink-100 placeholder:text-ink-600 focus:border-k-500/50 focus:outline-none disabled:opacity-40"

function KInput({ type = "text", placeholder, value, onChange, className, disabled, monospace }: {
  type?: string; placeholder?: string; value: string
  onChange: (v: string) => void; className?: string; disabled?: boolean; monospace?: boolean
}) {
  return (
    <input type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(inputCls, monospace && "font-mono", className)} />
  )
}

function Toggle({ checked, onCheckedChange, disabled }: {
  checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button onClick={() => !disabled && onCheckedChange(!checked)} disabled={disabled}
      className={cn("relative h-5 w-9 rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-k-500" : "bg-ink-700")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
        checked ? "left-[18px]" : "left-0.5")} />
    </button>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[13px] text-ink-100 font-medium">{label}</p>
        {description && <p className="text-[11.5px] text-ink-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="py-6 border-b border-ink-800/60 last:border-0">{children}</div>
}

function SaveBtn({ onClick, saving }: { onClick: () => void; saving?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="h-9 px-4 bg-k-500 hover:bg-k-400 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors">
      {saving ? "Saving…" : "Save"}
    </button>
  )
}

function RestartNote() {
  return (
    <p className="text-[11px] text-ink-600 mt-1">
      Restart the server for this change to take effect.
    </p>
  )
}

function TimezoneCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const zones = React.useMemo(() =>
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (Intl as any).supportedValuesOf("timeZone") as string[]
      : ["UTC"],
  [])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(inputCls, "flex items-center justify-between")}>
          <span className="font-mono truncate">{value || "UTC"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-500 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezone…" />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((tz) => (
                <CommandItem key={tz} value={tz} onSelect={() => { onChange(tz); setOpen(false) }}>
                  {tz}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Tabs ──

const TABS = [
  { id: "server",    label: "Server" },
  { id: "streaming", label: "Streaming" },
  { id: "logging",   label: "Logging" },
  { id: "danger",    label: "Danger" },
] as const

type TabId = typeof TABS[number]["id"]

// ── Page ──

const DEFAULT: APISettings = {
  public_url:           "",
  http_addr:            ":8080",
  cors_origins:         ["*"],
  trust_proxy:          false,
  ssl_enabled:          false,
  ssl_auto_cert:        false,
  ssl_domains:          [],
  ssl_cert_file:        "",
  ssl_key_file:         "",
  hls_segment_duration: 6,
  hls_playlist_size:    5,
  log_level:            "info",
  log_format:           "text",
  timezone:             "UTC",
}

export default function SettingsPage() {
  const { refresh: refreshSettings } = React.useContext(SettingsContext)
  const [tab, setTab]         = React.useState<TabId>("server")
  const [cfg, setCfg]         = React.useState<APISettings>(DEFAULT)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving]   = React.useState(false)

  // Danger zone
  const [resetInput,   setResetInput]   = React.useState("")
  const [resetOpen,    setResetOpen]    = React.useState(false)
  const [restartOpen,  setRestartOpen]  = React.useState(false)
  const [restarting,   setRestarting]   = React.useState(false)

  React.useEffect(() => {
    api.settings.get()
      .then((s) => setCfg(s))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.settings.update(cfg)
      setCfg(updated)
      refreshSettings()
      toast.success("Settings saved")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof APISettings>(key: K, val: APISettings[K]) =>
    setCfg((prev) => ({ ...prev, [key]: val }))

  const handleRestart = async () => {
    setRestartOpen(false)
    setRestarting(true)
    try {
      await api.server.restart()
      toast.success("Server restarting — page will reload shortly…")
      setTimeout(() => window.location.reload(), 5000)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to restart server")
      setRestarting(false)
    }
  }

  const handleFactoryReset = async () => {
    setResetOpen(false)
    setResetInput("")
    try {
      await api.server.factoryReset()
      toast.success("Factory reset initiated — redirecting…")
      setTimeout(() => { window.location.href = "/login" }, 3000)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Factory reset failed")
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Settings</h1>
          <p className="mt-1 text-[12.5px] text-ink-400">Global server configuration</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 rounded-full border-2 border-ink-800 border-t-k-500 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Settings</h1>
        <p className="mt-1 text-[12.5px] text-ink-400">Global server configuration</p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-ink-800 mb-8 gap-0.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px",
              tab === t.id
                ? t.id === "danger"
                  ? "border-red-500 text-red-400"
                  : "border-k-500 text-ink-100"
                : t.id === "danger"
                  ? "border-transparent text-red-400/60 hover:text-red-400"
                  : "border-transparent text-ink-500 hover:text-ink-200"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Server ── */}
      {tab === "server" && (
        <div className="max-w-xl space-y-0">
          <Section>
            <SectionLabel>Identity</SectionLabel>
            <FieldGroup>
              <Field label="Public Base URL"
                hint="Used for player embed links, webhook callbacks, and SSL certificate requests.">
                <KInput value={cfg.public_url} onChange={(v) => set("public_url", v)}
                  placeholder="https://stream.example.com" monospace />
              </Field>
              <Field label="Timezone"
                hint="IANA timezone for time displays in this dashboard (e.g. Europe/Istanbul, America/New_York).">
                <TimezoneCombobox value={cfg.timezone} onChange={(v) => set("timezone", v)} />
              </Field>
            </FieldGroup>
          </Section>

          <Section>
            <SectionLabel>Network</SectionLabel>
            <FieldGroup>
              <Field label="HTTP Listen Address" hint="Format: :8080 or 0.0.0.0:8080">
                <KInput value={cfg.http_addr} onChange={(v) => set("http_addr", v)}
                  monospace placeholder=":8080" />
                <RestartNote />
              </Field>
              <Field label="CORS Origins" hint="One origin per line, or * for all">
                <textarea
                  className="h-20 w-full bg-ink-950 border border-ink-800 rounded-md px-3 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 font-mono focus:border-k-500/50 focus:outline-none resize-none"
                  value={(cfg.cors_origins ?? []).join("\n")}
                  onChange={(e) => set("cors_origins", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
                />
              </Field>
              <Row
                label="Trust Proxy"
                description="Read real client IPs from X-Forwarded-For. Enable when running behind a reverse proxy (nginx, Caddy, Traefik) or in Docker. Leave off for direct deployments."
              >
                <Toggle checked={cfg.trust_proxy ?? false} onCheckedChange={(v) => set("trust_proxy", v)} />
              </Row>
            </FieldGroup>
          </Section>

          <Section>
            <SectionLabel>SSL / TLS</SectionLabel>
            <FieldGroup>
              <Row label="Enable SSL" description="Serve HTTPS. Requires restart.">
                <Toggle checked={cfg.ssl_enabled} onCheckedChange={(v) => set("ssl_enabled", v)} />
              </Row>
              {cfg.ssl_enabled && (
                <>
                  <Row label="Auto Certificate" description="Obtain a free cert via Let's Encrypt.">
                    <Toggle checked={cfg.ssl_auto_cert} onCheckedChange={(v) => set("ssl_auto_cert", v)} />
                  </Row>
                  {cfg.ssl_auto_cert ? (
                    <Field label="Domains" hint="Space-separated list of domains for the certificate.">
                      <KInput value={(cfg.ssl_domains ?? []).join(" ")}
                        onChange={(v) => set("ssl_domains", v.split(/\s+/).filter(Boolean))}
                        monospace placeholder="stream.example.com www.example.com" />
                    </Field>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Certificate File">
                        <KInput value={cfg.ssl_cert_file} onChange={(v) => set("ssl_cert_file", v)}
                          monospace placeholder="/etc/ssl/server.crt" />
                      </Field>
                      <Field label="Key File">
                        <KInput value={cfg.ssl_key_file} onChange={(v) => set("ssl_key_file", v)}
                          monospace placeholder="/etc/ssl/server.key" />
                      </Field>
                    </div>
                  )}
                </>
              )}
            </FieldGroup>
          </Section>

          <div className="pt-2">
            <SaveBtn onClick={save} saving={saving} />
          </div>
        </div>
      )}

      {/* ── Streaming ── */}
      {tab === "streaming" && (
        <div className="max-w-xl">
          <Section>
            <SectionLabel>HLS</SectionLabel>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Segment Duration (s)"
                  hint="Length of each HLS segment in seconds.">
                  <KInput type="number" value={String(cfg.hls_segment_duration)}
                    onChange={(v) => set("hls_segment_duration", Number(v))} />
                </Field>
                <Field label="Playlist Size"
                  hint="Number of segments kept in the playlist.">
                  <KInput type="number" value={String(cfg.hls_playlist_size)}
                    onChange={(v) => set("hls_playlist_size", Number(v))} />
                </Field>
              </div>
            </FieldGroup>
            <RestartNote />
          </Section>

          <div className="pt-2">
            <SaveBtn onClick={save} saving={saving} />
          </div>
        </div>
      )}

      {/* ── Logging ── */}
      {tab === "logging" && (
        <div className="max-w-xl">
          <Section>
            <SectionLabel>Log Output</SectionLabel>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Log Level">
                  <Select value={cfg.log_level} onValueChange={(v) => set("log_level", v as APISettings["log_level"])}>
                    <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100 text-[12.5px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["debug", "info", "warn", "error"] as const).map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Log Format">
                  <Select value={cfg.log_format} onValueChange={(v) => set("log_format", v as APISettings["log_format"])}>
                    <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100 text-[12.5px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldGroup>
          </Section>

          <div className="pt-2">
            <SaveBtn onClick={save} saving={saving} />
          </div>
        </div>
      )}

      {/* ── Danger ── */}
      {tab === "danger" && (
        <div className="max-w-xl">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-red-500/10">
              <h3 className="text-[13px] font-semibold text-red-400">Danger Zone</h3>
              <p className="text-[12px] text-ink-500 mt-0.5">Irreversible server actions. Proceed with extreme caution.</p>
            </div>

            <div className="px-5 py-4 border-b border-red-500/10">
              <Row label="Restart Server" description="Gracefully restarts Kast. Active streams will be interrupted briefly.">
                <button
                  onClick={() => setRestartOpen(true)}
                  disabled={restarting}
                  className="h-8 px-3 rounded-md border border-ink-800 hover:bg-ink-800 text-[12.5px] text-ink-200 transition-colors disabled:opacity-50">
                  {restarting ? "Restarting…" : "Restart"}
                </button>
              </Row>
            </div>

            <div className="px-5 py-4">
              <Row label="Factory Reset" description="Wipe all configuration, keys, and recordings. This cannot be undone.">
                <button onClick={() => setResetOpen(true)}
                  className="h-8 px-3 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-[12.5px] font-medium transition-colors">
                  Factory Reset
                </button>
              </Row>
            </div>
          </div>
        </div>
      )}

      {/* Restart dialog */}
      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart server?</AlertDialogTitle>
            <AlertDialogDescription>All active streams will be briefly interrupted. Listeners will reconnect automatically.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestart}>Restart</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Factory reset dialog */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factory reset Kast?</AlertDialogTitle>
            <AlertDialogDescription>
              All configuration, API keys, mount credentials, and recordings will be permanently deleted.
              Type <strong>RESET</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className={cn(inputCls, "font-mono")}
            value={resetInput} onChange={(e) => setResetInput(e.target.value)} placeholder="RESET"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetInput("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={resetInput !== "RESET"}
              onClick={handleFactoryReset}>
              Reset Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
