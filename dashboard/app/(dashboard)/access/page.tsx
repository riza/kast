"use client"

import { KeyRound } from "lucide-react"

export default function AccessPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Access & Auth</h1>
        <p className="text-[12.5px] text-ink-400 mt-1">API keys and source credentials</p>
      </div>

      <div className="border-t border-ink-800 flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <KeyRound className="h-12 w-12 opacity-20" />
        <p className="text-sm">API key management not yet implemented</p>
        <div className="max-w-md space-y-2 text-center text-xs">
          <p>
            The admin API key lives in <code className="rounded bg-muted px-1.5 py-0.5">server/kast.toml</code> under <code className="rounded bg-muted px-1.5 py-0.5">[admin].api_key</code>.
            It is used for external programmatic access via <code className="rounded bg-muted px-1.5 py-0.5">Authorization: Bearer &lt;key&gt;</code> — the dashboard itself uses username + password login.
          </p>
          <p>
            Source (encoder) passwords are set per-mount via the <strong>New Mount</strong> dialog.
          </p>
        </div>
      </div>
    </div>
  )
}
