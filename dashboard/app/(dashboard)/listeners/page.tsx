"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users } from "lucide-react"

export default function ListenersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Listeners</h1>
        <p className="text-sm text-muted-foreground">
          Active stream consumers
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Users className="h-12 w-12 opacity-20" />
          <p className="text-sm">Per-listener tracking not yet implemented</p>
          <p className="max-w-md text-center text-xs">
            The server currently exposes only total listener counts per mount.
            Detailed listener sessions (IP, user-agent, duration, kick) will arrive once
            an HLS access log is wired up server-side.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
