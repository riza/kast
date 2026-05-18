"use client"

import * as React from "react"
import { Plus, MoreHorizontal, Copy, Check, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api, type APIUser, type APIKey, type CreateAPIKeyResponse } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types & helpers ───────────────────────────────────────────────────────────

type Role = "admin" | "operator" | "viewer"

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "never"
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return "never"
  const d = new Date(dateStr)
  if (d < new Date()) return "expired"
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

const ROLE_STYLES: Record<Role, string> = {
  admin:    "bg-violet-500/15 text-violet-400 border-violet-500/25",
  operator: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  viewer:   "bg-ink-700 text-ink-400 border-ink-600",
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10.5px] font-mono border ${ROLE_STYLES[role]}`}>
      {role}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AccessPage() {
  const [users, setUsers] = React.useState<APIUser[]>([])
  const [me, setMe] = React.useState<APIUser | null>(null)
  const [usersLoading, setUsersLoading] = React.useState(true)

  const [apiKeys, setApiKeys] = React.useState<APIKey[]>([])
  const [keysLoading, setKeysLoading] = React.useState(true)

  // Add user dialog
  const [addOpen, setAddOpen] = React.useState(false)
  const [addForm, setAddForm] = React.useState({ username: "", password: "", role: "viewer" as Role })
  const [addSaving, setAddSaving] = React.useState(false)

  // Change password dialog
  const [pwTarget, setPwTarget] = React.useState<APIUser | null>(null)
  const [pwForm, setPwForm] = React.useState({ password: "", confirm: "" })
  const [pwSaving, setPwSaving] = React.useState(false)

  // Delete user confirm
  const [deleteTarget, setDeleteTarget] = React.useState<APIUser | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Create API key dialog
  type KeyDialogMode = "form" | "reveal"
  const [keyDialogOpen, setKeyDialogOpen] = React.useState(false)
  const [keyDialogMode, setKeyDialogMode] = React.useState<KeyDialogMode>("form")
  const [keyForm, setKeyForm] = React.useState({ name: "", expiresAt: "", ipAllowlist: "" })
  const [keySaving, setKeySaving] = React.useState(false)
  const [createdKey, setCreatedKey] = React.useState<CreateAPIKeyResponse | null>(null)
  const [keyCopied, setKeyCopied] = React.useState(false)

  // Delete API key confirm
  const [deleteKeyTarget, setDeleteKeyTarget] = React.useState<APIKey | null>(null)
  const [deletingKey, setDeletingKey] = React.useState(false)

  async function loadUsers() {
    try {
      const [userList, currentUser] = await Promise.all([api.users.list(), api.auth.me()])
      setUsers(userList)
      setMe(currentUser)
    } catch {
      toast.error("Failed to load users")
    } finally {
      setUsersLoading(false)
    }
  }

  async function loadKeys() {
    try {
      const keys = await api.apikeys.list()
      setApiKeys(keys ?? [])
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setKeysLoading(false)
    }
  }

  React.useEffect(() => {
    loadUsers()
    loadKeys()
  }, [])

  // ── User handlers ──────────────────────────────────────────────────────────

  async function handleAddUser() {
    if (!addForm.username || !addForm.password) return
    setAddSaving(true)
    try {
      await api.users.create(addForm)
      toast.success("User created")
      setAddOpen(false)
      setAddForm({ username: "", password: "", role: "viewer" })
      await loadUsers()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create user")
    } finally {
      setAddSaving(false)
    }
  }

  async function handleChangeRole(user: APIUser, role: Role) {
    try {
      await api.users.update(user.id, { role })
      toast.success(`Role changed to ${role}`)
      await loadUsers()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update role")
    }
  }

  async function handleChangePassword() {
    if (!pwTarget) return
    if (pwForm.password !== pwForm.confirm) { toast.error("Passwords do not match"); return }
    if (pwForm.password.length < 8) { toast.error("Password must be at least 8 characters"); return }
    setPwSaving(true)
    try {
      await api.users.update(pwTarget.id, { password: pwForm.password })
      toast.success("Password updated")
      setPwTarget(null)
      setPwForm({ password: "", confirm: "" })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update password")
    } finally {
      setPwSaving(false)
    }
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.users.delete(deleteTarget.id)
      toast.success("User deleted")
      setDeleteTarget(null)
      await loadUsers()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete user")
    } finally {
      setDeleting(false)
    }
  }

  // ── API key handlers ───────────────────────────────────────────────────────

  function openKeyDialog() {
    setKeyForm({ name: "", expiresAt: "", ipAllowlist: "" })
    setKeyDialogMode("form")
    setCreatedKey(null)
    setKeyCopied(false)
    setKeyDialogOpen(true)
  }

  function closeKeyDialog() {
    setKeyDialogOpen(false)
    if (keyDialogMode === "reveal") loadKeys()
  }

  async function handleCreateKey() {
    if (!keyForm.name.trim()) return
    setKeySaving(true)
    try {
      const ipList = keyForm.ipAllowlist
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean)
      const body: Parameters<typeof api.apikeys.create>[0] = { name: keyForm.name.trim() }
      if (keyForm.expiresAt) body.expires_at = keyForm.expiresAt
      if (ipList.length > 0) body.ip_allowlist = ipList
      const result = await api.apikeys.create(body)
      setCreatedKey(result)
      setKeyDialogMode("reveal")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create API key")
    } finally {
      setKeySaving(false)
    }
  }

  async function handleCopyKey() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey.key)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  async function handleToggleKey(k: APIKey) {
    try {
      await api.apikeys.update(k.id, { enabled: !k.enabled })
      await loadKeys()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update key")
    }
  }

  async function handleDeleteKey() {
    if (!deleteKeyTarget) return
    setDeletingKey(true)
    try {
      await api.apikeys.delete(deleteKeyTarget.id)
      toast.success("API key revoked")
      setDeleteKeyTarget(null)
      await loadKeys()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete API key")
    } finally {
      setDeletingKey(false)
    }
  }

  const isSelf = (u: APIUser) => me?.id === u.id

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-ink-100">Access & Auth</h1>
        <p className="text-[12.5px] text-ink-400 mt-1">Manage users and API credentials</p>
      </div>

      {/* ── Users table ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-ink-800 bg-ink-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
          <h2 className="text-[13px] font-semibold text-ink-100">Users</h2>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium bg-k-500 text-white hover:bg-k-600 transition-colors">
            <Plus className="h-3.5 w-3.5" />
            Add User
          </button>
        </div>

        <div className="divide-y divide-ink-800">
          <div className="grid grid-cols-[1fr_120px_110px_36px] gap-3 px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Username</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Role</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Added</span>
            <span />
          </div>

          {usersLoading ? (
            [0, 1].map(i => (
              <div key={i} className="grid grid-cols-[1fr_120px_110px_36px] gap-3 px-4 py-3 items-center">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-6 rounded" />
              </div>
            ))
          ) : users.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px] text-ink-500">No users found</div>
          ) : (
            users.map(user => (
              <div key={user.id} className="grid grid-cols-[1fr_120px_110px_36px] gap-3 px-4 py-3 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-ink-100 font-medium">{user.username}</span>
                  {isSelf(user) && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-k-500/15 text-k-400 border border-k-500/25">
                      you
                    </span>
                  )}
                </div>
                <RoleBadge role={user.role} />
                <span className="text-[12px] text-ink-500">{relativeTime(user.created_at)}</span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-ink-400 hover:text-ink-100">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="text-xs">Change Role</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {(["admin", "operator", "viewer"] as Role[]).map(role => (
                          <DropdownMenuItem
                            key={role}
                            className="text-xs capitalize"
                            disabled={user.role === role}
                            onClick={() => handleChangeRole(user, role)}
                          >
                            {role}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      className="text-xs"
                      onClick={() => { setPwTarget(user); setPwForm({ password: "", confirm: "" }) }}
                    >
                      Change Password
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs text-red-400 focus:text-red-400 focus:bg-red-500/10"
                      disabled={isSelf(user)}
                      onClick={() => setDeleteTarget(user)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── API Keys table ───────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-ink-800 bg-ink-900">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
          <h2 className="text-[13px] font-semibold text-ink-100">API Keys</h2>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={openKeyDialog}>
            <Plus className="h-3.5 w-3.5" />
            Create Key
          </Button>
        </div>

        <div className="divide-y divide-ink-800">
          <div className="grid grid-cols-[1fr_90px_100px_90px_90px_44px_36px] gap-3 px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Name</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Prefix</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">IP Allowlist</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Last used</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Expires</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-500">On</span>
            <span />
          </div>

          {keysLoading ? (
            [0, 1].map(i => (
              <div key={i} className="grid grid-cols-[1fr_90px_100px_90px_90px_44px_36px] gap-3 px-4 py-3 items-center">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-8 rounded-full" />
                <Skeleton className="h-6 w-6 rounded" />
              </div>
            ))
          ) : apiKeys.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px] text-ink-500">
              No API keys — create one to enable programmatic access
            </div>
          ) : (
            apiKeys.map(k => (
              <div key={k.id} className="grid grid-cols-[1fr_90px_100px_90px_90px_44px_36px] gap-3 px-4 py-3 items-center">
                <span className="text-[13px] text-ink-100 font-medium truncate">{k.name}</span>
                <code className="text-[11px] text-ink-400 font-mono">{k.prefix}…</code>
                <span className="text-[12px] text-ink-500">
                  {k.ip_allowlist.length === 0
                    ? <span className="text-ink-600">any</span>
                    : <span title={k.ip_allowlist.join("\n")}>{k.ip_allowlist.length} IP{k.ip_allowlist.length !== 1 ? "s" : ""}</span>
                  }
                </span>
                <span className="text-[12px] text-ink-500">{relativeTime(k.last_used_at)}</span>
                <span className={`text-[12px] ${k.expires_at && new Date(k.expires_at) < new Date() ? "text-red-400" : "text-ink-500"}`}>
                  {formatExpiry(k.expires_at)}
                </span>
                <Switch
                  checked={k.enabled}
                  onCheckedChange={() => handleToggleKey(k)}
                  className="data-[state=checked]:bg-k-500"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-ink-500 hover:text-red-400"
                  onClick={() => setDeleteKeyTarget(k)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Add User Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input
                value={addForm.username}
                onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))}
                placeholder="alice"
                autoComplete="off"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={addForm.password}
                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v as Role }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
            <Button size="sm" onClick={handleAddUser} disabled={addSaving || !addForm.username || !addForm.password}>
              {addSaving ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Password Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!pwTarget} onOpenChange={open => { if (!open) setPwTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Change Password — {pwTarget?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">New Password</Label>
              <Input
                type="password"
                value={pwForm.password}
                onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Confirm Password</Label>
              <Input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="Repeat password"
                autoComplete="new-password"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPwTarget(null)} disabled={pwSaving}>Cancel</Button>
            <Button size="sm" onClick={handleChangePassword} disabled={pwSaving || !pwForm.password || !pwForm.confirm}>
              {pwSaving ? "Saving…" : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete User AlertDialog ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.username}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The user will immediately lose access.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
              onClick={handleDeleteUser}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Create API Key Dialog ────────────────────────────────────────────── */}
      <Dialog open={keyDialogOpen} onOpenChange={open => { if (!open) closeKeyDialog() }}>
        <DialogContent className="sm:max-w-sm">
          {keyDialogMode === "form" ? (
            <>
              <DialogHeader><DialogTitle>Create API Key</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={keyForm.name}
                    onChange={e => setKeyForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. CI pipeline"
                    autoComplete="off"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expires <span className="text-ink-500 font-normal">(optional)</span></Label>
                  <Input
                    type="date"
                    value={keyForm.expiresAt}
                    onChange={e => setKeyForm(f => ({ ...f, expiresAt: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">IP Allowlist <span className="text-ink-500 font-normal">(optional — one IP or CIDR per line)</span></Label>
                  <Textarea
                    value={keyForm.ipAllowlist}
                    onChange={e => setKeyForm(f => ({ ...f, ipAllowlist: e.target.value }))}
                    placeholder={"192.168.1.0/24\n10.0.0.1"}
                    rows={3}
                    className="text-sm font-mono resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={closeKeyDialog} disabled={keySaving}>Cancel</Button>
                <Button size="sm" onClick={handleCreateKey} disabled={keySaving || !keyForm.name.trim()}>
                  {keySaving ? "Creating…" : "Create Key"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>API Key Created</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-[12px] text-ink-400 leading-relaxed">
                  Copy your key now — it will <strong className="text-ink-200">not be shown again</strong>.
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={createdKey?.key ?? ""}
                    className="h-8 text-xs font-mono flex-1"
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleCopyKey}>
                    {keyCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {createdKey && createdKey.ip_allowlist.length > 0 && (
                  <p className="text-[11.5px] text-ink-500">
                    Restricted to: {createdKey.ip_allowlist.join(", ")}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button size="sm" onClick={closeKeyDialog}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete API Key AlertDialog ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteKeyTarget} onOpenChange={open => { if (!open) setDeleteKeyTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &ldquo;{deleteKeyTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This key will stop working immediately. Any clients using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingKey}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingKey}
              onClick={handleDeleteKey}
            >
              {deletingKey ? "Revoking…" : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
