"use client"

import * as React from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { api } from "@/lib/api"

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

function KInput({ id, type = "text", placeholder, value, onChange, className, disabled }: {
  id?: string; type?: string; placeholder?: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string; disabled?: boolean
}) {
  return (
    <input id={id} type={type} placeholder={placeholder} value={value} onChange={onChange}
      disabled={disabled} className={cn(inputCls, className)} />
  )
}

function Toggle({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onCheckedChange(!checked)}
      className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-k-500" : "bg-ink-700")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
        checked ? "left-[18px]" : "left-0.5")} />
    </button>
  )
}

function SaveBtn({ onClick, label = "Save" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick}
      className="h-9 px-4 bg-k-500 hover:bg-k-400 text-white text-[13px] font-semibold transition-colors">
      {label}
    </button>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6 border-b border-ink-800/60 last:border-0">
      {children}
    </div>
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

// ── Tabs ──

const TABS = [
  { id: "server",       label: "Server" },
  { id: "streaming",    label: "Streaming" },
  { id: "logging",      label: "Logging" },
  { id: "notifications",label: "Notifications" },
  { id: "danger",       label: "Danger" },
] as const

type TabId = typeof TABS[number]["id"]

// ── Page ──

export default function SettingsPage() {
  const [tab, setTab] = React.useState<TabId>("server")

  // ── Server ──
  const [serverName, setServerName]     = React.useState("My Kast Server")
  const [publicUrl, setPublicUrl]       = React.useState("https://stream.example.com")
  const [adminEmail, setAdminEmail]     = React.useState("admin@example.com")
  const [maxListeners, setMaxListeners] = React.useState("10000")
  const [maxPerMount, setMaxPerMount]   = React.useState("2000")

  // ── Network ──
  const [httpPort, setHttpPort]         = React.useState("8000")
  const [httpsEnabled, setHttpsEnabled] = React.useState(true)
  const [httpsPort, setHttpsPort]       = React.useState("8443")
  const [srtPort, setSrtPort]           = React.useState("9000")
  const [whepPort, setWhepPort]         = React.useState("8080")
  const [corsOrigins, setCorsOrigins]   = React.useState("*")

  // ── Streaming ──
  const [partDuration, setPartDuration] = React.useState(250)
  const [holdBack, setHoldBack]         = React.useState("3")
  const [segmentCount, setSegmentCount] = React.useState("5")
  const [preloadHints, setPreloadHints] = React.useState(true)

  // ── Logging ──
  const [logLevel, setLogLevel]         = React.useState("info")
  const [logFormat, setLogFormat]       = React.useState("text")
  const [logToFile, setLogToFile]       = React.useState(false)
  const [logPath, setLogPath]           = React.useState("/var/log/kast/kast.log")

  // ── Notifications ──
  const [alertEmail, setAlertEmail]                   = React.useState("")
  const [alertMountError, setAlertMountError]         = React.useState(true)
  const [alertTranscodeFail, setAlertTranscodeFail]   = React.useState(true)
  const [alertDisk, setAlertDisk]                     = React.useState(true)
  const [alertListenerSpike, setAlertListenerSpike]   = React.useState(false)

  // ── Danger ──
  const [resetInput, setResetInput] = React.useState("")
  const [resetOpen, setResetOpen]   = React.useState(false)

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
              <div className="grid grid-cols-2 gap-3">
                <Field label="Server Name"><KInput value={serverName} onChange={(e) => setServerName(e.target.value)} /></Field>
                <Field label="Admin Email"><KInput type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></Field>
              </div>
              <Field label="Public Base URL"><KInput value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max Total Listeners"><KInput type="number" value={maxListeners} onChange={(e) => setMaxListeners(e.target.value)} /></Field>
                <Field label="Max per Mount"><KInput type="number" value={maxPerMount} onChange={(e) => setMaxPerMount(e.target.value)} /></Field>
              </div>
            </FieldGroup>
            <div className="mt-4"><SaveBtn onClick={() => toast.success("Server settings saved")} /></div>
          </Section>

          <Section>
            <SectionLabel>Network &amp; Ports</SectionLabel>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <Field label="HTTP Port"><KInput type="number" value={httpPort} onChange={(e) => setHttpPort(e.target.value)} /></Field>
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] text-ink-300 font-medium">HTTPS Port</label>
                    <Toggle checked={httpsEnabled} onCheckedChange={setHttpsEnabled} />
                  </div>
                  <KInput type="number" value={httpsPort} onChange={(e) => setHttpsPort(e.target.value)} disabled={!httpsEnabled} />
                </div>
                <Field label="SRT Port"><KInput type="number" value={srtPort} onChange={(e) => setSrtPort(e.target.value)} /></Field>
                <Field label="WebRTC WHEP/WHIP Port"><KInput type="number" value={whepPort} onChange={(e) => setWhepPort(e.target.value)} /></Field>
              </div>
              <Field label="CORS Origins" hint="One origin per line, or * for all">
                <textarea
                  className="h-20 w-full bg-ink-950 border border-ink-800 rounded-md px-3 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 font-mono focus:border-k-500/50 focus:outline-none resize-none"
                  value={corsOrigins} onChange={(e) => setCorsOrigins(e.target.value)}
                />
              </Field>
            </FieldGroup>
            <div className="mt-4"><SaveBtn onClick={() => toast.success("Network settings saved")} /></div>
          </Section>
        </div>
      )}

      {/* ── Streaming ── */}
      {tab === "streaming" && (
        <div className="max-w-xl">
          <Section>
            <SectionLabel>LL-HLS Tuning</SectionLabel>
            <p className="text-[12px] text-ink-600 mb-4">Low-latency HLS streaming parameters</p>
            <FieldGroup>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] text-ink-300 font-medium">Part Duration</label>
                  <span className="text-[12px] text-ink-400 font-mono">{partDuration} ms</span>
                </div>
                <input type="range" min={100} max={1000} step={50} value={partDuration}
                  onChange={(e) => setPartDuration(Number(e.target.value))}
                  className="w-full accent-k-500" />
                <div className="flex justify-between text-[10.5px] text-ink-600 font-mono">
                  <span>100ms</span><span>1000ms</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hold-back (parts)"><KInput type="number" value={holdBack} onChange={(e) => setHoldBack(e.target.value)} /></Field>
                <Field label="Segment Count"><KInput type="number" value={segmentCount} onChange={(e) => setSegmentCount(e.target.value)} /></Field>
              </div>
              <Row label="Preload Hints" description="Send next part URL in playlist for faster loading">
                <Toggle checked={preloadHints} onCheckedChange={setPreloadHints} />
              </Row>
            </FieldGroup>
            <div className="mt-4"><SaveBtn onClick={() => toast.success("Streaming settings saved")} /></div>
          </Section>
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
                  <Select value={logLevel} onValueChange={setLogLevel}>
                    <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100 text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["debug","info","warn","error"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Log Format">
                  <Select value={logFormat} onValueChange={setLogFormat}>
                    <SelectTrigger className="h-8 bg-ink-950 border-ink-800 text-ink-100 text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Row label="Log to File" description="Write logs to disk in addition to stdout">
                <Toggle checked={logToFile} onCheckedChange={setLogToFile} />
              </Row>
              {logToFile && (
                <Field label="Log File Path">
                  <KInput value={logPath} onChange={(e) => setLogPath(e.target.value)} className="font-mono" />
                </Field>
              )}
            </FieldGroup>
            <div className="mt-4"><SaveBtn onClick={() => toast.success("Logging settings saved")} /></div>
          </Section>
        </div>
      )}

      {/* ── Notifications ── */}
      {tab === "notifications" && (
        <div className="max-w-xl">
          <Section>
            <SectionLabel>Email Alerts</SectionLabel>
            <p className="text-[12px] text-ink-600 mb-4">Receive email notifications for critical server events</p>
            <FieldGroup>
              <Field label="Alert Email">
                <KInput type="email" placeholder="ops@example.com" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} />
              </Field>
              <div>
                <label className="text-[12px] text-ink-300 font-medium">Alert On</label>
                <div className="mt-2 space-y-2">
                  {[
                    { id: "mount-error",    label: "Mount error",          checked: alertMountError,    set: setAlertMountError },
                    { id: "transcode-fail", label: "Transcode failure",     checked: alertTranscodeFail, set: setAlertTranscodeFail },
                    { id: "disk-90",        label: "Disk usage > 90%",      checked: alertDisk,          set: setAlertDisk },
                    { id: "spike",          label: "Listener spike > 200%", checked: alertListenerSpike, set: setAlertListenerSpike },
                  ].map((item) => (
                    <label key={item.id} className="flex items-center gap-2.5 cursor-pointer group">
                      <div
                        onClick={() => item.set(!item.checked)}
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer",
                          item.checked ? "border-k-500 bg-k-500" : "border-ink-700 group-hover:border-ink-500"
                        )}>
                        {item.checked && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-[12.5px] text-ink-200">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </FieldGroup>
            <div className="mt-4"><SaveBtn onClick={() => toast.success("Notification settings saved")} /></div>
          </Section>
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
                <AlertDialog>
                  <button
                    onClick={() => {
                      const el = document.getElementById("restart-trigger")
                      el?.click()
                    }}
                    className="h-8 px-3 rounded-md border border-ink-800 hover:bg-ink-800 text-[12.5px] text-ink-200 transition-colors">
                    Restart
                  </button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restart server?</AlertDialogTitle>
                      <AlertDialogDescription>All active streams will be briefly interrupted. Listeners will reconnect automatically.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => toast.success("Server restarting…")}>Restart</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
            <AlertDialogAction variant="destructive" disabled={resetInput !== "RESET"} onClick={() => { setResetOpen(false); setResetInput(""); toast.error("Factory reset initiated") }}>
              Reset Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
