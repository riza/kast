"use client"

import { Card, CardContent } from "@/components/ui/card"
import { KeyRound } from "lucide-react"

export default function AccessPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Access</h1>
        <p className="text-sm text-muted-foreground">
          API keys and source credentials
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <KeyRound className="h-12 w-12 opacity-20" />
          <p className="text-sm">API key management not yet implemented</p>
          <div className="max-w-md space-y-2 text-center text-xs">
            <p>
              For now, the admin API key lives in <code className="rounded bg-muted px-1.5 py-0.5">server/kast.toml</code> under <code className="rounded bg-muted px-1.5 py-0.5">[admin].api_key</code>.
            </p>
            <p>
              Source (encoder) passwords are set per-mount via the <strong>New Mount</strong> dialog.
            </p>
            <p>
              Enter the admin key in <strong>Settings → API Connection</strong> to authenticate the dashboard.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
