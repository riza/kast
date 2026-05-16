"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  Radio,
  Users,
  Music2,
  ListMusic,
  Webhook,
  KeyRound,
  Settings,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Menu,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useColorTheme } from "@/components/color-theme-provider"
import { COLOR_THEMES } from "@/lib/color-themes"

// ── Navigation Definition ──

type NavItem = {
  path: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { path: "/mounts", label: "Mounts", icon: Radio },
  { path: "/listeners", label: "Listeners", icon: Users },
  { path: "/library", label: "Library", icon: Music2 },
  { path: "/playlists", label: "Playlists", icon: ListMusic },

  { path: "/webhooks", label: "Webhooks", icon: Webhook },
  { path: "/access", label: "Access & Auth", icon: KeyRound },
  { path: "/settings", label: "Settings", icon: Settings },
]

// ── Navigation Pending Context ──

const NavigationContext = React.createContext<{ pendingPath: string | null }>({
  pendingPath: null,
})

function useNavigationPending() {
  return React.useContext(NavigationContext)
}

function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [pendingPath, setPendingPath] = React.useState<string | null>(null)

  React.useEffect(() => {
    setPendingPath(null)
  }, [pathname])

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest(
        "a[href]"
      ) as HTMLAnchorElement | null
      if (!anchor || anchor.target === "_blank" || e.metaKey || e.ctrlKey)
        return
      const href = anchor.getAttribute("href")
      if (href && href.startsWith("/") && href !== pathname) {
        setPendingPath(href)
      }
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [pathname])

  return (
    <NavigationContext.Provider value={{ pendingPath }}>
      {pendingPath && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5">
          <div
            className="h-full bg-primary"
            style={{ animation: "progress 2s ease-in-out infinite" }}
          />
          <style>{`
            @keyframes progress {
              0% { width: 0%; }
              50% { width: 70%; }
              100% { width: 95%; }
            }
          `}</style>
        </div>
      )}
      {children}
    </NavigationContext.Provider>
  )
}

// ── Theme Toggle ──

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { colorTheme, setColorTheme } = useColorTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Monitor className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {theme === "light" ? (
            <Sun className="h-4 w-4" />
          ) : theme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Mode
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Color
        </DropdownMenuLabel>
        <div className="px-2 pb-2 pt-1">
          <div className="grid grid-cols-8 gap-1.5">
            {COLOR_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setColorTheme(t.id)}
                className={cn(
                  "h-5 w-5 transition-all",
                  colorTheme === t.id
                    ? "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background"
                    : "hover:scale-125"
                )}
                style={{ backgroundColor: t.swatch }}
                title={t.label}
              />
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            {COLOR_THEMES.find((t) => t.id === colorTheme)?.label}
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Navbar ──

function AppNavbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Link href="/dashboard" className="mr-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center border border-primary/25 bg-primary/5 text-sm font-semibold text-primary">
            K
          </div>
          <span className="hidden text-lg font-semibold tracking-tight sm:inline-block">
            Kast
          </span>
        </Link>

        <div className="flex-1" />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex h-9 items-center gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                  AD
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline-block">
                Admin
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">Admin</p>
                <p className="text-xs text-muted-foreground">
                  admin@kast.local
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

// ── Nav Links ──

function NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { pendingPath } = useNavigationPending()
  const activePath = pendingPath || pathname

  return (
    <nav className="space-y-0.5 px-2">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive =
          activePath === item.path || activePath.startsWith(item.path + "/")

        const linkClass = cn(
          "flex items-center gap-3 py-2.5 text-sm font-medium transition-colors border-l-2",
          collapsed ? "justify-center px-2" : "px-3",
          isActive
            ? "border-primary bg-primary/10 text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        )

        if (collapsed) {
          return (
            <Tooltip key={item.path} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link href={item.path} className={linkClass} onClick={onNavigate}>
                  <Icon className="h-4 w-4 shrink-0" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          )
        }

        return (
          <Link
            key={item.path}
            href={item.path}
            className={linkClass}
            onClick={onNavigate}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

// ── Desktop Sidebar ──

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <aside
      className={cn(
        "sticky top-14 hidden md:flex h-[calc(100vh-3.5rem)] flex-col border-r bg-background transition-[width] duration-200 relative",
        collapsed ? "w-14" : "w-56"
      )}
    >
      <Button
        variant="outline"
        size="icon"
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 h-6 w-6 rounded-full border bg-background shadow-sm"
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </Button>

      <ScrollArea className="flex-1">
        <div className="py-3">
          <NavLinks collapsed={collapsed} />
        </div>
      </ScrollArea>

      <div
        className={cn(
          "border-t px-4 pb-4 pt-3",
          collapsed
            ? "flex justify-center"
            : "flex items-center justify-between"
        )}
      >
        {!collapsed && (
          <Badge variant="secondary" className="text-[10px]">
            v0.9.1-beta
          </Badge>
        )}
        <a
          href="https://github.com/riza/kast"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </aside>
  )
}

// ── Mobile Sidebar ──

function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-56 p-0" showCloseButton={false}>
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center border border-primary/25 bg-primary/5 text-sm font-semibold text-primary">
            K
          </div>
          <span className="text-lg font-semibold tracking-tight">Kast</span>
        </div>
        <div className="py-3">
          <NavLinks onNavigate={() => onOpenChange(false)} />
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <Badge variant="secondary" className="text-[10px]">
            v0.9.1-beta
          </Badge>
          <a
            href="https://github.com/riza/kast"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Page Skeleton ──

function PageSkeleton() {
  return (
    <div className="animate-in fade-in space-y-6 duration-150">
      <div>
        <div className="h-8 w-48 bg-muted" />
        <div className="mt-2 h-4 w-72 bg-muted" />
      </div>
      <div className="h-10 w-full bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full bg-muted" />
        ))}
      </div>
    </div>
  )
}

// ── Dashboard Shell ──

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { pendingPath } = useNavigationPending()
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const stored = localStorage.getItem("kast-sidebar-collapsed")
    if (stored !== null) setCollapsed(stored === "true")
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("kast-sidebar-collapsed", String(next))
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar onMenuClick={() => setMobileOpen(true)} />
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
      <div className="flex">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        <main className="flex-1 overflow-hidden p-6">
          {pendingPath ? <PageSkeleton /> : children}
        </main>
      </div>
    </div>
  )
}

// ── Layout Export ──

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <NavigationProvider>
      <DashboardShell>{children}</DashboardShell>
    </NavigationProvider>
  )
}
