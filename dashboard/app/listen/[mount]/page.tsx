"use client"

import * as React from "react"
import Hls from "hls.js"

// ── Types ──────────────────────────────────────────────────────────────────

type NowPlaying = {
  title:       string
  artist:      string
  album:       string
  duration_ms: number
} | null

type StationInfo = {
  name:                string
  description:         string
  genre:               string
  website:             string
  protocol:            string
  codec:               string
  bitrate:             string
  status:              "idle" | "live" | "error"
  listeners:           number
  now_playing:         NowPlaying
  // Player config from admin
  player_station_name:  string
  player_accent:        string
  player_accent_soft:   string
  player_theme:         "dark" | "light"
  player_layout:        "split" | "centered"
  player_ambient:       boolean
  player_show_about:    boolean
  player_show_history:  boolean
  player_show_playlist: boolean
}

type HistoryTrack = { title: string; artist: string; album: string; duration_ms: number }
type PlaylistInfo  = { name: string; mode: string; tracks: HistoryTrack[] }

// ── Utils ──────────────────────────────────────────────────────────────────

function slugToName(s: string) {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function strColor(str: string): [string, string] {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i)
  h = Math.abs(h)
  const hue1 = h % 360
  const hue2 = (hue1 + 130 + (h >> 8) % 60) % 360
  const sat  = 50 + (h >> 4) % 25
  const li1  = 38 + (h >> 12) % 12
  const li2  = 14 + (h >> 16) % 10
  return [`hsl(${hue1},${sat}%,${li1}%)`, `hsl(${hue2},${sat - 10}%,${li2}%)`]
}

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, "0")}`
}

function cx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(" ")
}

function getServerBase() {
  if (typeof window === "undefined") return ""
  return (
    localStorage.getItem("kast_api_url") ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, "")
}

// ── SVG icons ──────────────────────────────────────────────────────────────

type IconProps = { size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }

const mkIcon =
  (paths: React.ReactNode, fill = "none") =>
  ({ size = 18, className = "", strokeWidth = 1.75, style }: IconProps) =>
    (
      <svg
        width={size} height={size} viewBox="0 0 24 24"
        fill={fill} stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        className={className} style={style}
      >
        {paths}
      </svg>
    )

const Play        = mkIcon(<polygon points="6 4 20 12 6 20 6 4" />, "currentColor")
const Pause       = mkIcon(<><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></>)
const Volume      = mkIcon(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>)
const VolumeMute  = mkIcon(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>)
const Share       = mkIcon(<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>)
const Sun         = mkIcon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>)
const Moon        = mkIcon(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />)
const Globe       = mkIcon(<><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>)
const Radio       = mkIcon(<><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9c3.9 3.9 3.9 10.3 0 14.2" /></>)
const Users       = mkIcon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>)
const ChevronRight = mkIcon(<polyline points="9 18 15 12 9 6" />)

// ── Toast ──────────────────────────────────────────────────────────────────

type ToastCtxType = { push: (msg: string) => void }
const ToastCtx = React.createContext<ToastCtxType>({ push: () => {} })

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<{ id: string; msg: string }[]>([])
  const push = React.useCallback((msg: string) => {
    const id = Math.random().toString(36).slice(2)
    setItems((s) => [...s, { id, msg }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto border border-[var(--pl-line)] px-4 py-2.5 text-[13px] font-mono"
            style={{ background: "var(--pl-bg-2)", color: "var(--pl-fg)", animation: "kp-toast-in 200ms ease-out both" }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
const useToast = () => React.useContext(ToastCtx)

// ── Equalizer bars ─────────────────────────────────────────────────────────

function Eq({ playing, className = "" }: { playing: boolean; className?: string }) {
  return (
    <div className={cx("flex items-end gap-[3px] w-[28px] h-[18px]", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="w-[3px] bg-current"
          style={{
            animationName: `kp-eq-${i}`,
            animationDuration: "0.9s",
            animationIterationCount: "infinite",
            animationTimingFunction: "ease-in-out",
            animationDelay: `${i * 0.07}s`,
            animationPlayState: playing ? "running" : "paused",
            height: playing ? undefined : "20%",
          }}
        />
      ))}
    </div>
  )
}

// ── Album Art (circular) ───────────────────────────────────────────────────

function AlbumArt({
  colors, label, sublabel, duration, playing, onPlayToggle, size = 400,
}: {
  colors: [string, string]; label: string; sublabel: string
  duration: number; playing: boolean; onPlayToggle: () => void; size?: number
}) {
  const [c1, c2] = colors
  return (
    <div
      className="relative group select-none mx-auto"
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        borderRadius: "50%",
        overflow: "hidden",
      }}
    >
      {/* Gradient fill */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
          animation: playing ? "kp-vinyl-spin 18s linear infinite" : "kp-vinyl-spin 18s linear infinite paused",
        }}
      />
      {/* Light texture */}
      <div
        className="absolute inset-0 opacity-20 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5) 0%, transparent 45%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.5) 0%, transparent 50%)",
        }}
      />
      {/* Vinyl grooves */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 50%, transparent 0px, transparent 10px, rgba(0,0,0,0.3) 10px, rgba(0,0,0,0.3) 11px)",
        }}
      />
      {/* Center label */}
      <div
        className="absolute rounded-full flex flex-col items-center justify-center text-center p-3"
        style={{
          inset: "28%",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
        }}
      >
        <div
          className="font-serif italic text-white leading-tight"
          style={{ fontSize: "clamp(10px, 2.5vw, 16px)", textWrap: "balance" } as React.CSSProperties}
        >
          {label || "—"}
        </div>
        {sublabel && (
          <div className="font-mono text-white/60 mt-0.5" style={{ fontSize: "clamp(8px, 1.5vw, 11px)" }}>
            {sublabel}
          </div>
        )}
        {duration > 0 && (
          <div className="font-mono text-white/40 mt-0.5" style={{ fontSize: "clamp(7px, 1.2vw, 10px)" }}>
            {fmtTime(duration)}
          </div>
        )}
      </div>
      {/* Play overlay */}
      <button
        onClick={onPlayToggle}
        className="absolute inset-0 flex items-center justify-center"
        aria-label={playing ? "Pause" : "Play"}
      >
        <div className="w-16 h-16 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all">
          {playing ? <Pause size={22} /> : <Play size={22} className="translate-x-0.5" />}
        </div>
      </button>
    </div>
  )
}

// ── Live strip ─────────────────────────────────────────────────────────────

function LiveStrip({ listeners, bitrate, codec, playing, accent }: {
  listeners: number; bitrate: string; codec: string; playing: boolean; accent: string
}) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="inline-flex items-center gap-2 px-2.5 py-1 border"
        style={{ borderColor: accent, color: accent, background: "var(--pl-accent-soft)" }}
      >
        <span className="w-1.5 h-1.5" style={{ background: accent, animation: "kp-live-pulse 1.4s ease-in-out infinite" }} />
        <span className="font-mono text-[11px] tracking-[0.18em] uppercase font-medium">On Air</span>
      </div>
      <div className="inline-flex items-center gap-1.5 font-mono text-[12px]" style={{ color: "var(--pl-fg-2)" }}>
        <Users size={13} />
        <span className="tabular-nums">{listeners.toLocaleString()}</span>
        <span style={{ color: "var(--pl-fg-3)" }}>listening</span>
      </div>
      <div className="inline-flex items-center gap-1.5 font-mono text-[12px]" style={{ color: "var(--pl-fg-2)" }}>
        <Eq playing={playing} />
        <span style={{ color: "var(--pl-fg-3)" }}>{bitrate} · {codec}</span>
      </div>
    </div>
  )
}

function OfflineStrip() {
  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 border" style={{ borderColor: "var(--pl-line)", color: "var(--pl-fg-3)" }}>
      <span className="w-1.5 h-1.5" style={{ background: "var(--pl-fg-3)" }} />
      <span className="font-mono text-[11px] tracking-[0.18em] uppercase">Offline</span>
    </div>
  )
}

// ── Controls ───────────────────────────────────────────────────────────────

function Controls({ playing, togglePlay, volume, setVolume, muted, setMuted, accent, disabled }: {
  playing: boolean; togglePlay: () => void
  volume: number; setVolume: (v: number) => void
  muted: boolean; setMuted: (v: boolean) => void
  accent: string; disabled: boolean
}) {
  return (
    <div className="mt-10 flex items-center gap-2 flex-wrap">
      <button
        onClick={togglePlay}
        disabled={disabled}
        className="w-14 h-14 flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: accent, color: "#fff" }}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={22} /> : <Play size={22} className="translate-x-0.5" />}
      </button>
      <div
        className="flex items-center gap-3 ml-auto h-14 px-3 border"
        style={{ borderColor: "var(--pl-line)", minWidth: "180px" }}
      >
        <button
          onClick={() => setMuted(!muted)}
          className="transition-colors"
          style={{ color: "var(--pl-fg-2)" }}
          aria-label="Mute"
        >
          {muted || volume === 0 ? <VolumeMute size={16} /> : <Volume size={16} />}
        </button>
        <input
          type="range" min="0" max="100" value={muted ? 0 : volume}
          onChange={(e) => { setVolume(Number(e.target.value)); if (Number(e.target.value) > 0) setMuted(false) }}
          className="kp-slider flex-1"
          style={{
            background: `linear-gradient(to right, ${accent} 0%, ${accent} ${muted ? 0 : volume}%, var(--pl-line) ${muted ? 0 : volume}%, var(--pl-line) 100%)`,
          }}
        />
        <span className="font-mono text-[11px] tabular-nums w-7 text-right" style={{ color: "var(--pl-fg-3)" }}>
          {muted ? 0 : volume}
        </span>
      </div>
    </div>
  )
}

// ── Section head ───────────────────────────────────────────────────────────

function SectionHead({ label }: { label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase shrink-0" style={{ color: "var(--pl-fg-3)" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "var(--pl-line)" }} />
    </div>
  )
}

// ── About panel ────────────────────────────────────────────────────────────

function AboutPanel({ name, description, genre, website }: {
  name: string; description?: string; genre?: string; website?: string
}) {
  return (
    <section>
      <SectionHead label={`About ${name}`} />
      {description && (
        <p className="mt-5 text-[14px] leading-relaxed" style={{ color: "var(--pl-fg-2)", textWrap: "pretty" } as React.CSSProperties}>
          {description}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2.5">
        {genre && (
          <div className="inline-flex items-center gap-2.5 text-[13px]">
            <Radio size={14} style={{ color: "var(--pl-fg-3)" }} />
            <span className="font-mono">{genre}</span>
          </div>
        )}
        {website && (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2.5 text-[13px] hover:opacity-70 transition-opacity"
          >
            <Globe size={14} style={{ color: "var(--pl-fg-3)" }} />
            <span className="font-mono">{website.replace(/^https?:\/\//, "")}</span>
          </a>
        )}
      </div>
    </section>
  )
}

// ── History panel ──────────────────────────────────────────────────────────

function HistoryPanel({ tracks }: { tracks: HistoryTrack[] }) {
  if (tracks.length === 0) return (
    <section>
      <SectionHead label="Recently Played" />
      <p className="mt-5 text-[13px] font-mono" style={{ color: "var(--pl-fg-3)" }}>Nothing played yet.</p>
    </section>
  )
  return (
    <section>
      <SectionHead label="Recently Played" />
      <ul className="mt-5 divide-y" style={{ borderColor: "var(--pl-line)" }}>
        {tracks.map((t, i) => {
          const [c1, c2] = strColor(t.title + t.artist)
          return (
            <li key={i} className="flex items-center gap-3 py-3">
              <div className="w-10 h-10 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] truncate">{t.title}</div>
                <div className="font-mono text-[11px] truncate" style={{ color: "var(--pl-fg-3)" }}>{t.artist}</div>
              </div>
              <div className="font-mono text-[11px] tabular-nums shrink-0" style={{ color: "var(--pl-fg-3)" }}>
                {fmtTime(t.duration_ms)}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Playlist panel ─────────────────────────────────────────────────────────

function PlaylistPanel({ playlist }: { playlist: PlaylistInfo | null }) {
  if (!playlist || playlist.tracks.length === 0) return (
    <section>
      <SectionHead label="Playlist" />
      <p className="mt-5 text-[13px] font-mono" style={{ color: "var(--pl-fg-3)" }}>No active playlist.</p>
    </section>
  )
  return (
    <section>
      <SectionHead label={playlist.name} />
      <div className="mt-2 mb-4 flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--pl-fg-3)" }}>
          {playlist.tracks.length} tracks · {playlist.mode}
        </span>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--pl-line)" }}>
        {playlist.tracks.map((t, i) => {
          const [c1, c2] = strColor(t.title + t.artist)
          return (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <div className="font-mono text-[11px] tabular-nums w-5 shrink-0 text-right" style={{ color: "var(--pl-fg-3)" }}>{i + 1}</div>
              <div className="w-8 h-8 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] truncate">{t.title}</div>
                <div className="font-mono text-[11px] truncate" style={{ color: "var(--pl-fg-3)" }}>{t.artist}</div>
              </div>
              <div className="font-mono text-[11px] tabular-nums shrink-0" style={{ color: "var(--pl-fg-3)" }}>
                {fmtTime(t.duration_ms)}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Queue panel ────────────────────────────────────────────────────────────

function QueuePanel({
  np, history, playlist, accent,
}: {
  np: NowPlaying
  history: HistoryTrack[]
  playlist: PlaylistInfo | null
  accent: string
}) {
  const recent   = history.slice(0, 5).reverse()
  const upcoming = playlist?.tracks.slice(0, 5) ?? []

  return (
    <section>
      <SectionHead label="Queue" />
      <ul className="mt-5 divide-y" style={{ borderColor: "var(--pl-line)" }}>
        {recent.map((t, i) => {
          const [c1, c2] = strColor(t.title + t.artist)
          return (
            <li key={`h-${i}`} className="flex items-center gap-3 py-2.5 opacity-40">
              <div className="w-8 h-8 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg,${c1} 0%,${c2} 100%)` }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] truncate">{t.title}</div>
                <div className="font-mono text-[11px] truncate" style={{ color: "var(--pl-fg-3)" }}>{t.artist}</div>
              </div>
              <div className="font-mono text-[11px] tabular-nums shrink-0" style={{ color: "var(--pl-fg-3)" }}>{fmtTime(t.duration_ms)}</div>
            </li>
          )
        })}

        {np && (() => {
          const [c1, c2] = strColor(np.title + np.artist)
          return (
            <li className="flex items-center gap-3 py-3 -mx-3 px-3" style={{ background: "var(--pl-card)" }}>
              <div className="w-8 h-8 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg,${c1} 0%,${c2} 100%)` }} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] tracking-[0.15em] uppercase mb-0.5" style={{ color: accent }}>Now Playing</div>
                <div className="text-[13px] truncate font-semibold">{np.title}</div>
                <div className="font-mono text-[11px] truncate" style={{ color: "var(--pl-fg-3)" }}>{np.artist}</div>
              </div>
              <div className="font-mono text-[11px] tabular-nums shrink-0" style={{ color: "var(--pl-fg-3)" }}>{fmtTime(np.duration_ms)}</div>
            </li>
          )
        })()}

        {upcoming.map((t, i) => {
          const [c1, c2] = strColor(t.title + t.artist)
          return (
            <li key={`n-${i}`} className="flex items-center gap-3 py-2.5">
              <div className="font-mono text-[11px] tabular-nums w-5 shrink-0 text-right" style={{ color: "var(--pl-fg-3)" }}>{i + 1}</div>
              <div className="w-8 h-8 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg,${c1} 0%,${c2} 100%)` }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] truncate">{t.title}</div>
                <div className="font-mono text-[11px] truncate" style={{ color: "var(--pl-fg-3)" }}>{t.artist}</div>
              </div>
              <div className="font-mono text-[11px] tabular-nums shrink-0" style={{ color: "var(--pl-fg-3)" }}>{fmtTime(t.duration_ms)}</div>
            </li>
          )
        })}

        {recent.length === 0 && !np && upcoming.length === 0 && (
          <li className="py-3">
            <p className="text-[13px] font-mono" style={{ color: "var(--pl-fg-3)" }}>Queue is empty.</p>
          </li>
        )}
      </ul>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────────────────────

function Footer({ accent }: { accent: string }) {
  return (
    <footer className="mt-24 pt-8 border-t" style={{ borderColor: "var(--pl-line)" }}>
      <div className="flex items-end justify-start">
        <a
          href="https://getkast.dev"
          target="_blank" rel="noreferrer"
          className="group inline-flex items-center gap-3 border px-3 py-2.5 hover:bg-[var(--pl-card)] transition-colors"
          style={{ borderColor: "var(--pl-line)" }}
        >
          <div className="w-6 h-6 flex items-center justify-center text-white font-mono text-[11px] font-bold" style={{ background: accent }}>K</div>
          <div className="leading-tight">
            <div className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: "var(--pl-fg-3)" }}>Powered by</div>
            <div className="font-mono text-[13px] font-semibold tracking-tight -mt-0.5">Kast</div>
          </div>
          <ChevronRight size={13} style={{ color: "var(--pl-fg-3)" }} />
        </a>
      </div>
    </footer>
  )
}

// ── Player CSS ─────────────────────────────────────────────────────────────

const PLAYER_CSS = `
  @keyframes kp-live-pulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.85)} }
  @keyframes kp-eq-1 { 0%,100%{height:30%}50%{height:100%} }
  @keyframes kp-eq-2 { 0%,100%{height:80%}50%{height:25%} }
  @keyframes kp-eq-3 { 0%,100%{height:50%}50%{height:95%} }
  @keyframes kp-eq-4 { 0%,100%{height:95%}50%{height:40%} }
  @keyframes kp-eq-5 { 0%,100%{height:40%}50%{height:85%} }
  @keyframes kp-vinyl-spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
  @keyframes kp-toast-in { from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1} }
  .kp-slider{-webkit-appearance:none;appearance:none;height:4px;cursor:pointer}
  .kp-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;background:var(--pl-fg);border:0;cursor:pointer}
  .kp-slider::-moz-range-thumb{width:12px;height:12px;background:var(--pl-fg);border:0;cursor:pointer}
`

// ── Page ───────────────────────────────────────────────────────────────────

export default function ListenPage({
  params,
}: {
  params: Promise<{ mount: string }>
}) {
  const { mount } = React.use(params)

  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const hlsRef   = React.useRef<Hls | null>(null)

  const [station, setStation]       = React.useState<StationInfo | null>(null)
  const [serverBase, setServerBase] = React.useState("")
  const [playing, setPlaying]       = React.useState(false)
  const [loading, setLoading]       = React.useState(false)
  const [hlsError, setHlsError]     = React.useState<string | null>(null)
  const [volume, setVolume]         = React.useState(75)
  const [muted, setMuted]           = React.useState(false)
  const [history, setHistory]       = React.useState<HistoryTrack[]>([])
  const [playlist, setPlaylist]     = React.useState<PlaylistInfo | null>(null)

  React.useEffect(() => { setServerBase(getServerBase()) }, [])

  const hlsUrl    = serverBase ? `${serverBase}/hls/${mount}/index.m3u8` : ""
  const publicUrl = serverBase ? `${serverBase}/public/${mount}` : ""

  // Poll station info
  React.useEffect(() => {
    if (!publicUrl) return
    const load = () =>
      fetch(publicUrl)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data: StationInfo) => setStation(data))
        .catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [publicUrl])

  // Poll history every 10s
  React.useEffect(() => {
    if (!serverBase) return
    const load = () =>
      fetch(`${serverBase}/public/${mount}/history`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: HistoryTrack[]) => setHistory(data ?? []))
        .catch(() => {})
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [serverBase, mount])

  // Fetch playlist whenever station changes (playlist_id may change)
  React.useEffect(() => {
    if (!serverBase) return
    fetch(`${serverBase}/public/${mount}/playlist`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PlaylistInfo) => setPlaylist(data?.tracks?.length ? data : null))
      .catch(() => {})
  }, [serverBase, mount, station?.status])

  // Ambient glow
  const np = station?.now_playing
  const trackColors = strColor((np?.title ?? "") + (np?.artist ?? ""))
  React.useEffect(() => {
    document.documentElement.style.setProperty("--kp-ambient-1", trackColors[0])
    document.documentElement.style.setProperty("--kp-ambient-2", trackColors[1])
  }, [np?.title, np?.artist])

  // Page title
  const accent      = station?.player_accent       || "#E85D2F"
  const accentSoft  = station?.player_accent_soft  || "rgba(232,93,47,0.16)"
  const theme       = station?.player_theme        || "dark"
  const layout      = station?.player_layout       || "split"
  const ambient     = station?.player_ambient      ?? true
  const showAbout   = station?.player_show_about   ?? true
  const showHistory  = station?.player_show_history  ?? true
  const showPlaylist = station?.player_show_playlist ?? true
  const stationName = (station?.player_station_name || "").trim()
    || (station ? slugToName(station.name.replace(/^\//, "")) : slugToName(mount))
  const initials    = stationName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase() || "K"

  React.useEffect(() => {
    const track = np ? `${np.title} — ${np.artist}` : "Live"
    document.title = `${stationName} · ${track}`
  }, [stationName, np])

  // Sync volume/mute
  React.useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume / 100
  }, [volume, muted])

  // HLS play / stop
  const toast = useToast()

  const startPlay = React.useCallback(() => {
    if (!hlsUrl || !audioRef.current) return
    setLoading(true); setHlsError(null)
    const audio = audioRef.current
    const onPlay  = () => { setPlaying(true);  setLoading(false) }
    const onPause = () => setPlaying(false)
    const onErr   = () => { setHlsError("Stream unavailable — retrying…"); setLoading(false) }
    audio.addEventListener("playing", onPlay)
    audio.addEventListener("pause",   onPause)
    audio.addEventListener("error",   onErr)

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(audio)
      hls.on(Hls.Events.MANIFEST_PARSED, () => audio.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) { setHlsError("Stream error"); setLoading(false) }
      })
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      audio.src = hlsUrl
      audio.play().catch(() => {})
    } else {
      setHlsError("HLS not supported in this browser"); setLoading(false)
    }
    return () => {
      audio.removeEventListener("playing", onPlay)
      audio.removeEventListener("pause",   onPause)
      audio.removeEventListener("error",   onErr)
    }
  }, [hlsUrl])

  const stopPlay = () => {
    hlsRef.current?.destroy(); hlsRef.current = null
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = "" }
    setPlaying(false); setLoading(false)
  }

  const handlePlayToggle = () => {
    if (playing || loading) stopPlay()
    else startPlay()
  }

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href)
    toast.push("Link copied to clipboard")
  }

  const isLive = station?.status === "live"
  const isDark = theme === "dark"

  const plVars: React.CSSProperties = {
    "--pl-bg":          isDark ? "#0E0D0B" : "#F4EFE7",
    "--pl-bg-2":        isDark ? "#161412" : "#E8E2D6",
    "--pl-fg":          isDark ? "#F4EFE7" : "#14110D",
    "--pl-fg-2":        isDark ? "#A8A299" : "#5A554D",
    "--pl-fg-3":        isDark ? "#6B6660" : "#8C8780",
    "--pl-line":        isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    "--pl-card":        isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
    "--pl-accent":      accent,
    "--pl-accent-soft": accentSoft,
  } as React.CSSProperties

  return (
    <ToastProvider>
      <style dangerouslySetInnerHTML={{ __html: PLAYER_CSS }} />
      <div
        style={{
          ...plVars,
          background: "var(--pl-bg)",
          color: "var(--pl-fg)",
          minHeight: "100vh",
          overflowX: "hidden",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <audio ref={audioRef} preload="none" style={{ display: "none" }} />

        {/* Ambient glow */}
        {ambient && (
          <div
            aria-hidden="true"
            style={{
              position: "fixed", inset: "-20%",
              background:
                "radial-gradient(60% 50% at 30% 30%, var(--kp-ambient-1, var(--pl-accent)) 0%, transparent 60%), radial-gradient(60% 50% at 70% 70%, var(--kp-ambient-2, var(--pl-accent)) 0%, transparent 65%)",
              filter: "blur(80px)",
              opacity: isDark ? 0.45 : 0.25,
              zIndex: 0, pointerEvents: "none",
              transition: "background 800ms ease, opacity 600ms ease",
            }}
          />
        )}

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Top bar */}
          <header className="px-6 lg:px-12 py-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 flex items-center justify-center text-white font-mono text-[14px] font-bold tracking-tight"
                style={{ background: accent }}
              >
                {initials}
              </div>
              <div>
                <div className="font-serif text-[20px] leading-none tracking-tight">{stationName}</div>
                {station?.description && (
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] mt-1 max-w-[280px] truncate" style={{ color: "var(--pl-fg-3)" }}>
                    {station.description}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleShare}
              className="w-9 h-9 flex items-center justify-center border hover:opacity-80 transition-opacity"
              style={{ borderColor: "var(--pl-line)" }}
              aria-label="Share"
              title="Share"
            >
              <Share size={15} />
            </button>
          </header>

          {/* Main */}
          <main className="px-6 lg:px-12 pb-12 pt-4" style={{ maxWidth: "1400px", margin: "0 auto" }}>
            {layout === "split" ? (
              /* Split */
              <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-10 lg:gap-14 items-center">
                {/* Left — circular art */}
                <div className="flex flex-col items-center lg:items-start" style={{ maxWidth: "480px" }}>
                  <AlbumArt
                    colors={trackColors}
                    label={np?.album || stationName}
                    sublabel={np?.artist || (isLive ? "Live" : "Offline")}
                    duration={np?.duration_ms ?? 0}
                    playing={playing}
                    onPlayToggle={handlePlayToggle}
                    size={420}
                  />
                  <div className="mt-5 font-mono text-[11px] uppercase tracking-wider text-center lg:text-left" style={{ color: "var(--pl-fg-3)" }}>
                    {np ? `${np.album} · ${np.artist}` : stationName}
                  </div>
                </div>

                {/* Right */}
                <div className="flex flex-col">
                  {isLive
                    ? <LiveStrip listeners={station?.listeners ?? 0} bitrate={station?.bitrate || "128k"} codec={station?.codec || "AAC"} playing={playing} accent={accent} />
                    : <OfflineStrip />
                  }
                  <h1
                    className="mt-6 font-serif text-[56px] md:text-[72px] leading-[0.95] tracking-tight"
                    style={{ textWrap: "balance" } as React.CSSProperties}
                  >
                    {np?.title || stationName}
                  </h1>
                  {np && (
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[13px] uppercase tracking-wider" style={{ color: "var(--pl-fg-2)" }}>{np.artist}</span>
                      {np.album && <><span style={{ color: "var(--pl-fg-3)" }}>·</span><span className="font-mono text-[13px]" style={{ color: "var(--pl-fg-3)" }}>{np.album}</span></>}
                    </div>
                  )}
                  {!isLive && !np && (
                    <div className="mt-4 font-mono text-[13px]" style={{ color: "var(--pl-fg-3)" }}>
                      {station ? "Stream is offline" : "Loading…"}
                    </div>
                  )}
                  {(hlsError || loading) && (
                    <div className="mt-3 font-mono text-[12px] border px-3 py-2 inline-block" style={{ borderColor: "var(--pl-line)", color: "var(--pl-fg-3)" }}>
                      {loading ? "Connecting…" : hlsError}
                    </div>
                  )}
                  <Controls
                    playing={playing} togglePlay={handlePlayToggle}
                    volume={volume} setVolume={setVolume}
                    muted={muted} setMuted={setMuted}
                    accent={accent}
                    disabled={!isLive && !playing && !loading}
                  />
                </div>
              </div>
            ) : (
              /* Centered */
              <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
                {isLive
                  ? <LiveStrip listeners={station?.listeners ?? 0} bitrate={station?.bitrate || "128k"} codec={station?.codec || "AAC"} playing={playing} accent={accent} />
                  : <OfflineStrip />
                }
                <div className="mt-8 w-full max-w-[360px]">
                  <AlbumArt
                    colors={trackColors}
                    label={np?.album || stationName}
                    sublabel={np?.artist || (isLive ? "Live" : "Offline")}
                    duration={np?.duration_ms ?? 0}
                    playing={playing}
                    onPlayToggle={handlePlayToggle}
                    size={360}
                  />
                </div>
                <h1
                  className="mt-8 font-serif text-[48px] md:text-[64px] leading-[0.95] tracking-tight"
                  style={{ textWrap: "balance" } as React.CSSProperties}
                >
                  {np?.title || stationName}
                </h1>
                {np && (
                  <div className="mt-3 font-mono text-[13px] uppercase tracking-wider" style={{ color: "var(--pl-fg-2)" }}>
                    {np.artist}{np.album ? ` · ${np.album}` : ""}
                  </div>
                )}
                <div className="w-full">
                  <Controls
                    playing={playing} togglePlay={handlePlayToggle}
                    volume={volume} setVolume={setVolume}
                    muted={muted} setMuted={setMuted}
                    accent={accent}
                    disabled={!isLive && !playing && !loading}
                  />
                </div>
              </div>
            )}

            {/* Panels: about, history, playlist */}
            {(showAbout || showHistory || showPlaylist) && (
              <div className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {showAbout && (station?.description || station?.genre || station?.website) && (
                  <AboutPanel
                    name={stationName}
                    description={station?.description}
                    genre={station?.genre}
                    website={station?.website}
                  />
                )}
                {(showHistory || showPlaylist) && (
                  <QueuePanel
                    np={np ?? null}
                    history={showHistory ? history : []}
                    playlist={showPlaylist ? playlist : null}
                    accent={accent}
                  />
                )}
              </div>
            )}

            <Footer accent={accent} />
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
