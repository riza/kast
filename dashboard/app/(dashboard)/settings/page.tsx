"use client"

import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
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
import { toast } from "sonner"
import { saveConnectionSettings, loadConnectionSettings } from "@/lib/api"

export default function SettingsPage() {
  // ── API Connection (localStorage) ──────────────────────────────────────────
  const [apiUrl, setApiUrl] = React.useState("http://localhost:8080")
  const [apiKey, setApiKey] = React.useState("")
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    const s = loadConnectionSettings()
    setApiUrl(s.url)
    setApiKey(s.key)
  }, [])

  const saveConnection = () => {
    saveConnectionSettings(apiUrl, apiKey)
    toast.success("Connection settings saved — will take effect immediately")
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const res = await fetch(apiUrl.replace(/\/$/, "") + "/api/status", {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Connected! Kast ${data.version} — uptime ${data.uptime_sec}s`)
      } else {
        toast.error(`Server responded with ${res.status} — check API key`)
      }
    } catch {
      toast.error("Could not reach server — check API URL")
    } finally {
      setTesting(false)
    }
  }

  // Server
  const [serverName, setServerName] = React.useState("My Kast Server")
  const [publicUrl, setPublicUrl] = React.useState("https://stream.example.com")
  const [adminEmail, setAdminEmail] = React.useState("admin@example.com")
  const [maxListeners, setMaxListeners] = React.useState("10000")
  const [maxPerMount, setMaxPerMount] = React.useState("2000")

  // Network
  const [httpPort, setHttpPort] = React.useState("8000")
  const [httpsEnabled, setHttpsEnabled] = React.useState(true)
  const [httpsPort, setHttpsPort] = React.useState("8443")
  const [srtPort, setSrtPort] = React.useState("9000")
  const [whepPort, setWhepPort] = React.useState("8080")
  const [corsOrigins, setCorsOrigins] = React.useState("*")

  // LL-HLS
  const [partDuration, setPartDuration] = React.useState(250)
  const [holdBack, setHoldBack] = React.useState("3")
  const [segmentCount, setSegmentCount] = React.useState("5")
  const [preloadHints, setPreloadHints] = React.useState(true)

  // Logging
  const [logLevel, setLogLevel] = React.useState("info")
  const [logFormat, setLogFormat] = React.useState("text")
  const [logToFile, setLogToFile] = React.useState(false)
  const [logPath, setLogPath] = React.useState("/var/log/kast/kast.log")

  // Notifications
  const [alertEmail, setAlertEmail] = React.useState("")
  const [alertMountError, setAlertMountError] = React.useState(true)
  const [alertTranscodeFail, setAlertTranscodeFail] = React.useState(true)
  const [alertDisk, setAlertDisk] = React.useState(true)
  const [alertListenerSpike, setAlertListenerSpike] = React.useState(false)

  // Danger: factory reset confirm
  const [resetInput, setResetInput] = React.useState("")
  const [resetOpen, setResetOpen] = React.useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Global server configuration
        </p>
      </div>

      {/* API Connection */}
      <Card>
        <CardHeader>
          <CardTitle>API Connection</CardTitle>
          <CardDescription>
            Saved in browser localStorage — no rebuild needed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="api-url">Server URL</Label>
            <Input
              id="api-url"
              placeholder="http://localhost:8080"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="your-api-key-from-kast.toml"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Found in <code className="font-mono">server/kast.toml</code> under{" "}
              <code className="font-mono">[admin] api_key</code>
            </p>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={saveConnection}>Save</Button>
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? "Testing…" : "Test Connection"}
          </Button>
        </CardFooter>
      </Card>

      {/* Server */}
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>Basic server identity and listener limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="server-name">Server Name</Label>
              <Input
                id="server-name"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="public-url">Public Base URL</Label>
            <Input
              id="public-url"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="max-listeners">Max Total Listeners</Label>
              <Input
                id="max-listeners"
                type="number"
                value={maxListeners}
                onChange={(e) => setMaxListeners(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max-per-mount">Max Listeners per Mount</Label>
              <Input
                id="max-per-mount"
                type="number"
                value={maxPerMount}
                onChange={(e) => setMaxPerMount(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success("Server settings saved")}>Save</Button>
        </CardFooter>
      </Card>

      {/* Network & Ports */}
      <Card>
        <CardHeader>
          <CardTitle>Network & Ports</CardTitle>
          <CardDescription>Protocol ports and CORS configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="http-port">HTTP Port</Label>
              <Input
                id="http-port"
                type="number"
                value={httpPort}
                onChange={(e) => setHttpPort(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="https-port">HTTPS Port</Label>
                <Switch
                  checked={httpsEnabled}
                  onCheckedChange={setHttpsEnabled}
                />
              </div>
              <Input
                id="https-port"
                type="number"
                value={httpsPort}
                onChange={(e) => setHttpsPort(e.target.value)}
                disabled={!httpsEnabled}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="srt-port">SRT Port</Label>
              <Input
                id="srt-port"
                type="number"
                value={srtPort}
                onChange={(e) => setSrtPort(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whep-port">WebRTC WHEP/WHIP Port</Label>
              <Input
                id="whep-port"
                type="number"
                value={whepPort}
                onChange={(e) => setWhepPort(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cors">CORS Origins</Label>
            <Textarea
              id="cors"
              value={corsOrigins}
              onChange={(e) => setCorsOrigins(e.target.value)}
              className="h-20 font-mono text-xs"
              placeholder="* or https://example.com"
            />
            <p className="text-xs text-muted-foreground">One origin per line, or * for all</p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success("Network settings saved")}>Save</Button>
        </CardFooter>
      </Card>

      {/* LL-HLS Tuning */}
      <Card>
        <CardHeader>
          <CardTitle>LL-HLS Tuning</CardTitle>
          <CardDescription>Low-latency HLS streaming parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label>Part Duration</Label>
              <span className="text-muted-foreground">{partDuration} ms</span>
            </div>
            <input
              type="range"
              min={100}
              max={1000}
              step={50}
              value={partDuration}
              onChange={(e) => setPartDuration(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>100ms</span>
              <span>1000ms</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hold-back">Playlist Hold-back (parts)</Label>
              <Input
                id="hold-back"
                type="number"
                value={holdBack}
                onChange={(e) => setHoldBack(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="seg-count">Segment Count in Playlist</Label>
              <Input
                id="seg-count"
                type="number"
                value={segmentCount}
                onChange={(e) => setSegmentCount(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Preload Hints</p>
              <p className="text-xs text-muted-foreground">Send next part URL in playlist for faster loading</p>
            </div>
            <Switch
              checked={preloadHints}
              onCheckedChange={setPreloadHints}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success("LL-HLS settings saved")}>Save</Button>
        </CardFooter>
      </Card>

      {/* Logging */}
      <Card>
        <CardHeader>
          <CardTitle>Logging</CardTitle>
          <CardDescription>Log verbosity and output configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Log Level</Label>
              <Select value={logLevel} onValueChange={setLogLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">debug</SelectItem>
                  <SelectItem value="info">info</SelectItem>
                  <SelectItem value="warn">warn</SelectItem>
                  <SelectItem value="error">error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Log Format</Label>
              <Select value={logFormat} onValueChange={setLogFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Log to File</p>
                <p className="text-xs text-muted-foreground">Write logs to disk in addition to stdout</p>
              </div>
              <Switch
                checked={logToFile}
                onCheckedChange={setLogToFile}
              />
            </div>
            {logToFile && (
              <div className="space-y-1">
                <Label htmlFor="log-path">Log File Path</Label>
                <Input
                  id="log-path"
                  value={logPath}
                  onChange={(e) => setLogPath(e.target.value)}
                  className="font-mono"
                />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success("Logging settings saved")}>Save</Button>
        </CardFooter>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Email alerts for critical server events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="alert-email">Alert Email</Label>
            <Input
              id="alert-email"
              type="email"
              placeholder="ops@example.com"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Alert On</p>
            <div className="space-y-2">
              {[
                { id: "mount-error", label: "Mount error", checked: alertMountError, onChange: setAlertMountError },
                { id: "transcode-fail", label: "Transcode failure", checked: alertTranscodeFail, onChange: setAlertTranscodeFail },
                { id: "disk-90", label: "Disk usage > 90%", checked: alertDisk, onChange: setAlertDisk },
                { id: "listener-spike", label: "Listener spike > 200%", checked: alertListenerSpike, onChange: setAlertListenerSpike },
              ].map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={(v) => item.onChange(v as boolean)}
                  />
                  <label htmlFor={item.id} className="cursor-pointer text-sm">
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success("Notification settings saved")}>Save</Button>
        </CardFooter>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible server actions. Proceed with extreme caution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Restart Server</p>
              <p className="text-xs text-muted-foreground">
                Gracefully restarts Kast. Active streams will be interrupted briefly.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Restart</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restart server?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All active streams will be briefly interrupted. Listeners will reconnect automatically.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => toast.success("Server restarting…")}>
                    Restart
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">Factory Reset</p>
              <p className="text-xs text-muted-foreground">
                Wipe all configuration, keys, and recordings. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setResetOpen(true)}
            >
              Factory Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Factory Reset Confirm */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factory reset Kast?</AlertDialogTitle>
            <AlertDialogDescription>
              All configuration, API keys, mount credentials, and recordings will be permanently deleted.
              Type <strong>RESET</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={resetInput}
            onChange={(e) => setResetInput(e.target.value)}
            placeholder="RESET"
            className="font-mono"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetInput("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={resetInput !== "RESET"}
              onClick={() => {
                setResetOpen(false)
                setResetInput("")
                toast.error("Factory reset initiated")
              }}
            >
              Reset Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
