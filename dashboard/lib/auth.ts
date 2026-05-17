export type AuthUser = {
  id: string
  username: string
  role: "admin" | "operator" | "viewer"
  created_at: string
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
  } catch {
    // ignore — redirect happens regardless
  }
}
