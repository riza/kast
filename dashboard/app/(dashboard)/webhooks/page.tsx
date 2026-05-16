"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Webhook } from "lucide-react"

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Event subscriptions and delivery logs
        </p>
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
