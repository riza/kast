const TOKEN_KEY = "kast_auth_token"

export type AuthUser = {
  id: string
  username: string
  role: "admin" | "operator" | "viewer"
  created_at: string
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  const token = getToken()
  if (!token) return false
  try {
    // Decode payload (no verification — server will reject expired tokens)
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.exp > Date.now() / 1000
  } catch {
    return false
  }
}

export function currentUser(): AuthUser | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return { id: payload.uid, username: payload.username, role: payload.role, created_at: "" }
  } catch {
    return null
  }
}
