"use client"

import * as React from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Radio,
  Users,
  Server,
  ExternalLink,
  Music2,
} from "lucide-react"
import { api, type APIStatus, type APIMount } from "@/lib/api"

// ── Helpers ──

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function StatusBadge({ status }: { status: "live" | "idle" | "error" }) {
  if (status === "live")
    return (
      <Badge className="border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400">
        Live
      </Badge>
    )
  if (status === "idle")
    return (
      <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
        Idle
      </Badge>
    )
  return (
    <Badge className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
      Error
    </Badge>
  )
}

// ── Page ──

export default function OverviewPage() {
  const [apiStatus, setApiStatus] = React.useState<APIStatus | null>(null)
  const [apiMounts, setApiMounts] = React.useState<APIMount[] | null>(null)
  const [error, setError]         = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    const load = () => {
      Promise.all([api.status(), api.mounts.list()])
        .then(([s, ms]) => {
          if (!alive) return
          setApiStatus(s); setApiMounts(ms); setError(null)
        })
        .catch((err) => { if (alive) setError(err.message) })
    }
    load()
    const id = setInterval(load, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const activeMountCount = apiMounts ? apiMounts.filter((m) => m.status === "live").length : null
  const totalListeners   = apiMounts ? apiMounts.reduce((s, m) => s + m.listeners, 0) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Server health and streaming activity
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <span>Failed to reach server: {error}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              Check API URL/key in Settings
            </span>
          </CardContent>
        </Card>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Active Mounts</CardDescription>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeMountCount !== null ? activeMountCount : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {apiMounts ? `${apiMounts.length} total mounts` : "Loading…"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Total Listeners</CardDescription>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalListeners !== null ? totalListeners.toLocaleString() : "—"}
            </div>
            <p className="text-xs text-muted-foreground">Across all mounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Server Uptime</CardDescription>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {apiStatus ? formatUptime(apiStatus.uptime_sec) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {apiStatus ? `Kast ${apiStatus.version} · ${apiStatus.go_version}` : "Since last restart"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Mounts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Mounts</CardTitle>
          <CardDescription>All configured stream endpoints</CardDescription>
        </CardHeader>
        <CardContent>
          {!apiMounts ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Radio className="h-10 w-10 opacity-20 animate-pulse" />
              <p className="text-sm">Loading mounts…</p>
            </div>
          ) : apiMounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Music2 className="h-10 w-10 opacity-20" />
              <p className="text-sm">No mounts yet</p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/mounts">
                  Create your first mount
                </Link>
              </Button>
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiMounts.map((mount) => (
                  <TableRow key={mount.id}>
                    <TableCell className="font-mono text-xs">{mount.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{mount.protocol || "HLS"}</Badge>
                    </TableCell>
                    <TableCell>{mount.codec || "—"}</TableCell>
                    <TableCell>{mount.bitrate || "—"}</TableCell>
                    <TableCell className="text-right">{mount.listeners.toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={mount.status as "live" | "idle" | "error"} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href="/mounts">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
