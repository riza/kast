import type { Metadata } from "next"
import { Geist_Mono, IBM_Plex_Sans } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ColorThemeProvider } from "@/components/color-theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: {
    default: "Kast",
    template: "%s - Kast",
  },
  description: "Kast — Open-source LL-HLS / WebRTC / SRT streaming server",
}

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        ibmPlexSans.variable
      )}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("dashacdn-color-theme");if(t&&t!=="stone"){document.documentElement.setAttribute("data-color-theme",t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <ColorThemeProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
            <Toaster richColors position="top-right" />
          </ColorThemeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
