// Typed fetch client for the Kast server API.
// Auth is via HttpOnly cookie (set by Go server, forwarded through Next.js proxy).
// All API calls use relative URLs so they go through the Next.js /api/* rewrite.

// ── Error type ───────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "APIError"
  }
}

// ── Core fetch helper ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: "no-store",
  })
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login"
    return undefined as T
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new APIError(res.status, text)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Response types (mirror Go JSON output) ───────────────────────────────────

export type APIStatus = {
  version:    string
  git_commit: string
  build_time: string
  uptime_sec: number
  go_version: string
  os_arch:    string
}

export type APIMount = {
  id:                   string
  name:                 string
  description:          string
  genre:                string
  website:              string
  protocol:             string
  codec:                string
  bitrate:              string
  status:               "idle" | "live" | "error"
  listeners:            number
  created_at:           string
  player_station_name:  string
  player_accent:        string
  player_accent_soft:   string
  player_theme:         string
  player_layout:        string
  player_ambient:       boolean
  player_show_about:    boolean
  player_show_history:  boolean
  player_show_playlist: boolean
}

export type PlayerConfigBody = {
  player_station_name:  string
  player_accent:        string
  player_accent_soft:   string
  player_theme:         string
  player_layout:        string
  player_ambient:       boolean
  player_show_about:    boolean
  player_show_history:  boolean
  player_show_playlist: boolean
}

export type APITrack = {
  id:           string
  path:         string
  title:        string
  artist:       string
  album:        string
  genre:        string
  duration_ms:  number
  bitrate_kbps: number
  size_bytes:   number
  folder:       string
  added_at:     string
}

export type APIPlaylist = {
  id:           string
  name:         string
  description:  string
  mode:         string
  crossfade_ms: number
  track_paths:  string[]
  created_at:   string
  updated_at:   string
}

export type APINowPlaying = {
  id:          string
  title:       string
  artist:      string
  album:       string
  duration_ms: number
} | null

// ── File upload ───────────────────────────────────────────────────────────────

export type APIUploadResult = {
  uploaded: { name: string; error?: string }[]
}

// ── YouTube import ────────────────────────────────────────────────────────────

export type APIImportItemStatus = "pending" | "downloading" | "done" | "error"

export type APIImportItem = {
  ytid:        string
  title:       string
  artist:      string
  duration_ms: number
  thumbnail:   string
  status:      APIImportItemStatus
  progress:    number
  error?:      string
}

export type APIPreviewResult = {
  type:  "video" | "playlist"
  title: string
  items: APIImportItem[]
}

export type APIImportJob = {
  id:         string
  status:     APIImportItemStatus
  items:      APIImportItem[]
  created_at: string
}

export type StartImportBody = {
  items: Pick<APIImportItem, "ytid" | "title" | "artist" | "duration_ms" | "thumbnail">[]
}

// ── Request body types ───────────────────────────────────────────────────────

export type CreateMountBody = {
  name:            string
  description?:    string
  genre?:          string
  website?:        string
  source_password: string
  bitrate?:        string
  codec?:          string
  protocol?:       string
}

export type CreatePlaylistBody = {
  name:          string
  description?:  string
  mode?:         string
  crossfade_ms?: number
  track_paths?:  string[]
}

export type UpdatePlaylistBody = {
  name?:         string
  description?:  string
  mode?:         string
  crossfade_ms?: number
  track_paths?:  string[]
}

export type StartAutoDJBody = {
  playlist_id:       string
  mode?:             string
  start_track_path?: string
}

export type APIAutoDJSession = {
  mount:       string
  playlist_id: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip the leading slash so "/radio1" becomes "radio1" for URL construction. */
function slug(name: string): string {
  return name.replace(/^\/+/, "")
}

function buildQS(params?: Record<string, string | undefined>): string {
  if (!params) return ""
  const entries = Object.entries(params).filter((e): e is [string, string] => !!e[1])
  if (entries.length === 0) return ""
  return "?" + new URLSearchParams(entries).toString()
}

// ── API object ───────────────────────────────────────────────────────────────

export type APIUser = {
  id:         string
  username:   string
  role:       "admin" | "operator" | "viewer"
  created_at: string
}

export type LoginResponse = {
  user: APIUser
}

export type APIListener = {
  ip:           string
  mount:        string
  last_seen:    string
  country_code: string
}

export const api = {
  auth: {
    /** POST /api/auth/login — sets HttpOnly cookie on success */
    login: (username: string, password: string) =>
      fetch("/api/auth/login", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ username, password }),
        credentials: "include",
      }).then(async (r) => {
        if (!r.ok) throw new APIError(r.status, "invalid credentials")
        return r.json() as Promise<LoginResponse>
      }),

    /** GET /api/auth/me */
    me: () => apiFetch<APIUser>("/api/auth/me"),
  },

  users: {
    list:   () => apiFetch<APIUser[]>("/api/users"),
    create: (body: { username: string; password: string; role: string }) =>
      apiFetch<APIUser>("/api/users", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { role?: string; password?: string }) =>
      apiFetch<APIUser>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<void>(`/api/users/${id}`, { method: "DELETE" }),
  },

  /** GET /api/status */
  status: () => apiFetch<APIStatus>("/api/status"),

  /** GET /api/listeners */
  listeners: {
    list: () => apiFetch<APIListener[]>("/api/listeners"),
  },

  /** GET /api/autodj/sessions — all active sessions across mounts */
  autoDJSessions: () => apiFetch<APIAutoDJSession[]>("/api/autodj/sessions"),

  mounts: {
    /** GET /api/mounts */
    list: () => apiFetch<APIMount[]>("/api/mounts"),

    /** GET /api/mounts/{name} */
    get: (name: string) => apiFetch<APIMount>(`/api/mounts/${slug(name)}`),

    /** POST /api/mounts */
    create: (body: CreateMountBody) =>
      apiFetch<APIMount>("/api/mounts", {
        method: "POST",
        body:   JSON.stringify(body),
      }),

    /** DELETE /api/mounts/{name} */
    delete: (name: string) =>
      apiFetch<void>(`/api/mounts/${slug(name)}`, { method: "DELETE" }),

    /** PUT /api/mounts/{name}/player — update player customisation (admin only) */
    updatePlayerConfig: (name: string, body: PlayerConfigBody) =>
      apiFetch<{ status: string }>(`/api/mounts/${slug(name)}/player`, {
        method: "PUT",
        body:   JSON.stringify(body),
      }),

    /** POST /api/mounts/{name}/autodj */
    startAutoDJ: (name: string, body: StartAutoDJBody) =>
      apiFetch<void>(`/api/mounts/${slug(name)}/autodj`, {
        method: "POST",
        body:   JSON.stringify(body),
      }),

    /** GET /api/mounts/{name}/autodj */
    autoDJStatus: (name: string) =>
      apiFetch<APIAutoDJSession>(`/api/mounts/${slug(name)}/autodj`),

    /** DELETE /api/mounts/{name}/autodj */
    stopAutoDJ: (name: string) =>
      apiFetch<void>(`/api/mounts/${slug(name)}/autodj`, { method: "DELETE" }),

    /** POST /api/mounts/{name}/autodj/skip */
    skipTrack: (name: string) =>
      apiFetch<{ status: string }>(`/api/mounts/${slug(name)}/autodj/skip`, { method: "POST" }),

    /** GET /api/mounts/{name}/nowplaying */
    nowPlaying: (name: string) =>
      apiFetch<APINowPlaying>(`/api/mounts/${slug(name)}/nowplaying`),
  },

  library: {
    /** GET /api/library[?q=&genre=] */
    list: (params?: { q?: string; genre?: string }) =>
      apiFetch<APITrack[]>("/api/library" + buildQS(params)),

    /** POST /api/library/scan */
    scan: () =>
      apiFetch<{ status: string }>("/api/library/scan", { method: "POST" }),

    /**
     * POST /api/library/upload
     * Uploads audio files via XHR so progress can be tracked.
     * onProgress is called with 0–100 as bytes are sent.
     */
    upload: (files: File[], onProgress?: (pct: number) => void): Promise<APIUploadResult> => {
      return new Promise((resolve, reject) => {
        const fd = new FormData()
        files.forEach((f) => fd.append("files", f))

        const xhr = new XMLHttpRequest()
        xhr.open("POST", "/api/library/upload")
        // Cookie is sent automatically for same-origin requests.

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(json as APIUploadResult)
            } else {
              reject(new APIError(xhr.status, json.error ?? xhr.statusText))
            }
          } catch {
            reject(new APIError(xhr.status, xhr.statusText))
          }
        }

        xhr.onerror = () => reject(new Error("Network error during upload"))
        xhr.send(fd)
      })
    },

    /** POST /api/library/import/youtube/preview */
    ytPreview: (url: string) =>
      apiFetch<APIPreviewResult>("/api/library/import/youtube/preview", {
        method: "POST",
        body:   JSON.stringify({ url }),
      }),

    /** POST /api/library/import/youtube */
    ytImport: (body: StartImportBody) =>
      apiFetch<{ job_id: string; created_at: string }>("/api/library/import/youtube", {
        method: "POST",
        body:   JSON.stringify(body),
      }),

    /** GET /api/library/imports */
    importJobs: () =>
      apiFetch<APIImportJob[]>("/api/library/imports"),

    /** GET /api/library/imports/{id} */
    importJob: (id: string) =>
      apiFetch<APIImportJob>(`/api/library/imports/${id}`),
  },

  playlists: {
    /** GET /api/playlists */
    list: () => apiFetch<APIPlaylist[]>("/api/playlists"),

    /** GET /api/playlists/{id} */
    get: (id: string) => apiFetch<APIPlaylist>(`/api/playlists/${id}`),

    /** POST /api/playlists */
    create: (body: CreatePlaylistBody) =>
      apiFetch<APIPlaylist>("/api/playlists", {
        method: "POST",
        body:   JSON.stringify(body),
      }),

    /** PUT /api/playlists/{id} */
    update: (id: string, body: UpdatePlaylistBody) =>
      apiFetch<APIPlaylist>(`/api/playlists/${id}`, {
        method: "PUT",
        body:   JSON.stringify(body),
      }),

    /** DELETE /api/playlists/{id} */
    delete: (id: string) =>
      apiFetch<void>(`/api/playlists/${id}`, { method: "DELETE" }),
  },
}
