import type { Metadata } from "next"

function slugToName(s: string) {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mount: string }>
}): Promise<Metadata> {
  const { mount } = await params
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "")

  let name = slugToName(mount)
  let description = ""

  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/public/${mount}`, {
        next: { revalidate: 30 },
      })
      if (res.ok) {
        const d = await res.json()
        const custom = (d.player_station_name ?? "").trim()
        name = custom || slugToName((d.name ?? mount).replace(/^\//, ""))
        description = d.description ?? ""
      }
    } catch {}
  }

  const desc = description || `Listen to ${name} — live radio`

  return {
    title: { absolute: name },
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      type: "music.radio_station",
      siteName: "Kast",
    },
    twitter: {
      card: "summary",
      title: name,
      description: desc,
    },
  }
}

export default function ListenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
