"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Webhook } from "lucide-react"

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Webhooks</h1>
        <p className="text-[12.5px] text-ink-400 mt-1">Event subscriptions and delivery logs</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Webhook className="h-12 w-12 opacity-20" />
          <p className="text-sm">Webhooks not yet implemented</p>
          <p className="max-w-md text-center text-xs">
            Outbound event delivery (mount.online, mount.offline, listener.connect,
            track.change, …) will land once the server publishes an event bus.
            Until then, poll the relevant <code className="rounded bg-muted px-1.5 py-0.5">/api/*</code> endpoints for state changes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
