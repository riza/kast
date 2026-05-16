"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Sliders } from "lucide-react"

export default function TranscodingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Transcoding</h1>
        <p className="text-sm text-muted-foreground">
          Output profile configuration
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Sliders className="h-12 w-12 opacity-20" />
          <p className="text-sm">Multi-bitrate transcoding not yet implemented</p>
          <p className="max-w-md text-center text-xs">
            Today each mount streams a single output bitrate (set when you create the mount).
            Multi-quality ladders (e.g. high / mid / mobile profiles) will land once an
            ffmpeg transcode worker is wired into the segmenter pipeline.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
