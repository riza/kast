"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import {
  Sun,
  Moon,
  Search,
  Mail,
  Plus,
  Trash2,
  Settings,
  User,
  LogOut,
  MoreHorizontal,
  Bell,
  ChevronRight,
  Copy,
  ExternalLink,
  ArrowUpDown,
  Check,
} from "lucide-react"
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
} from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { useColorTheme } from "@/components/color-theme-provider"
import {
  COLOR_THEMES,
  type ColorThemeId,
} from "@/lib/color-themes"
import { toast } from "sonner"

import {
  MOCK_PROJECTS,
  MOCK_USERS,
  MOCK_CHART_DATA,
  MOCK_COMMANDS,
  MOCK_NOTIFICATIONS,
  CHART_CONFIG_VISITORS,
  CHART_CONFIG_REVENUE,
  CHART_CONFIG_COMBINED,
} from "./data"

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground">{children}</p>
  )
}

// ── Buttons & Badges ──
function ButtonsBadgesTab() {
  return (
    <div className="space-y-8">
      <Section title="Button Variants">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default">Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </Section>

      <Section title="Button Sizes">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra Small</Button>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Icon Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon-xs" variant="outline">
            <Plus />
          </Button>
          <Button size="icon-sm" variant="outline">
            <Plus />
          </Button>
          <Button size="icon" variant="outline">
            <Plus />
          </Button>
          <Button size="icon-lg" variant="outline">
            <Plus />
          </Button>
        </div>
      </Section>

      <Section title="With Icons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>
            <Mail data-icon="inline-start" />
            Send Email
          </Button>
          <Button variant="outline">
            <Settings data-icon="inline-start" />
            Settings
          </Button>
          <Button variant="destructive">
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </div>
      </Section>

      <Section title="Disabled">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Separator />

      <Section title="Badge Variants">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="ghost">Ghost</Badge>
          <Badge variant="link">Link</Badge>
        </div>
      </Section>

      <Section title="Badge Examples">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>v2.1.0</Badge>
          <Badge variant="secondary">New</Badge>
          <Badge variant="destructive">3 issues</Badge>
          <Badge variant="outline">Deprecated</Badge>
        </div>
      </Section>
    </div>
  )
}

// ── Forms ──
function FormsTab() {
  return (
    <div className="space-y-8">
      <Section title="Input">
        <div className="grid max-w-sm gap-3">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Enter your name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Disabled</Label>
            <Input disabled placeholder="Cannot edit" />
          </div>
        </div>
      </Section>

      <Section title="Input Group">
        <div className="grid max-w-sm gap-3">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search..." />
          </InputGroup>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <InputGroupText>https://</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput placeholder="example.com" />
          </InputGroup>
          <InputGroup>
            <InputGroupInput placeholder="Enter keyword" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton variant="outline">
                <Search className="size-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </Section>

      <Section title="Textarea">
        <div className="grid max-w-sm gap-3">
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea placeholder="Write a description..." />
          </div>
        </div>
      </Section>

      <Section title="Select">
        <div className="grid max-w-sm gap-3">
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Priority</SelectLabel>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Checkbox & Switch">
        <div className="grid max-w-sm gap-4">
          <div className="flex items-center gap-2">
            <Checkbox id="terms" />
            <Label htmlFor="terms">Accept terms and conditions</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="checked" defaultChecked />
            <Label htmlFor="checked">Checked by default</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="disabled-check" disabled />
            <Label htmlFor="disabled-check">Disabled</Label>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label>Email notifications</Label>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label>Push notifications</Label>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <Label>Small switch</Label>
            <Switch size="sm" />
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Cards & Layout ──
function CardsLayoutTab() {
  return (
    <div className="space-y-8">
      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue</CardTitle>
              <CardDescription>Total revenue this month</CardDescription>
              <CardAction>
                <Button variant="ghost" size="icon-xs">
                  <MoreHorizontal />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">$45,231</p>
              <p className="text-xs text-muted-foreground">
                +12.5% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Users</CardTitle>
              <CardDescription>Users online now</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">2,350</p>
              <p className="text-xs text-muted-foreground">
                +180 in the last hour
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" className="w-full">
                View Details
              </Button>
            </CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="size-2 bg-green-500" />
                <span>All systems operational</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Separator">
        <div className="flex items-center gap-4">
          <span className="text-sm">Left</span>
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm">Right</span>
        </div>
        <Separator />
        <p className="text-sm text-muted-foreground">
          Content below separator
        </p>
      </Section>

      <Section title="Skeleton">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </Section>

      <Section title="Progress">
        <div className="grid max-w-md gap-3">
          <SectionLabel>0%</SectionLabel>
          <Progress value={0} />
          <SectionLabel>25%</SectionLabel>
          <Progress value={25} />
          <SectionLabel>50%</SectionLabel>
          <Progress value={50} />
          <SectionLabel>75%</SectionLabel>
          <Progress value={75} />
          <SectionLabel>100%</SectionLabel>
          <Progress value={100} />
        </div>
      </Section>
    </div>
  )
}

// ── Data Display ──
function DataDisplayTab() {
  return (
    <div className="space-y-8">
      <Section title="Table">
        <Table>
          <TableCaption>Project task list</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead className="text-right">Due Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_PROJECTS.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-mono">{project.id}</TableCell>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      project.status === "Done" ? "default" : "secondary"
                    }
                  >
                    {project.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      project.priority === "Critical"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {project.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Avatar size="sm">
                    <AvatarFallback>{project.assignee}</AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="text-right">{project.dueDate}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Avatar">
        <div className="flex flex-wrap items-center gap-6">
          <div className="space-y-2">
            <SectionLabel>Sizes</SectionLabel>
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                <AvatarFallback>SM</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>DF</AvatarFallback>
              </Avatar>
              <Avatar size="lg">
                <AvatarFallback>LG</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div className="space-y-2">
            <SectionLabel>With Badge</SectionLabel>
            <Avatar>
              <AvatarFallback>RS</AvatarFallback>
              <AvatarBadge />
            </Avatar>
          </div>
          <div className="space-y-2">
            <SectionLabel>Group</SectionLabel>
            <AvatarGroup>
              {MOCK_USERS.slice(0, 3).map((user) => (
                <Avatar key={user.initials}>
                  <AvatarFallback>{user.initials}</AvatarFallback>
                </Avatar>
              ))}
              <AvatarGroupCount>+2</AvatarGroupCount>
            </AvatarGroup>
          </div>
        </div>
      </Section>

      <Section title="Tooltip">
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>This is a tooltip</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Bell />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section title="Scroll Area">
        <ScrollArea className="h-48 w-full border p-4">
          <div className="space-y-3">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm">
                  Item #{i + 1} - Lorem ipsum dolor sit amet
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>
    </div>
  )
}

// ── Overlays ──
function OverlaysTab() {
  return (
    <div className="space-y-8">
      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-1">
                <Label htmlFor="project-name">Project Name</Label>
                <Input id="project-name" placeholder="My Project" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="project-desc">Description</Label>
                <Textarea
                  id="project-desc"
                  placeholder="Describe your project..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Alert Dialog">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete Project</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                project and all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Section>

      <Section title="Sheet">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Open Sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Settings</SheetTitle>
              <SheetDescription>
                Manage your application settings.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4">
              {MOCK_NOTIFICATIONS.map((notif, i) => (
                <div key={i} className="space-y-1 border-b pb-3">
                  <p className="text-sm font-medium">{notif.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {notif.description}
                  </p>
                  <p className="text-xs text-muted-foreground">{notif.time}</p>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </Section>

      <Section title="Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Open Popover</Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Quick Actions</h4>
              <div className="grid gap-1">
                <Button variant="ghost" className="justify-start" size="sm">
                  <Copy data-icon="inline-start" className="size-3.5" />
                  Copy Link
                </Button>
                <Button variant="ghost" className="justify-start" size="sm">
                  <ExternalLink
                    data-icon="inline-start"
                    className="size-3.5"
                  />
                  Open in Browser
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </Section>

      <Section title="Command">
        <Command className="max-w-sm border">
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {MOCK_COMMANDS.map((group) => (
              <React.Fragment key={group.group}>
                <CommandGroup heading={group.group}>
                  {group.items.map((item) => (
                    <CommandItem key={item}>{item}</CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </Section>

      <Section title="Toast / Sonner">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => toast.success("Operation completed successfully")}
          >
            Success Toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.error("Something went wrong")}
          >
            Error Toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.warning("Proceed with caution")}
          >
            Warning Toast
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("New update available")}
          >
            Info Toast
          </Button>
        </div>
      </Section>
    </div>
  )
}

// ── Navigation ──
function NavigationTab() {
  return (
    <div className="space-y-8">
      <Section title="Dropdown Menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <User data-icon="inline-start" />
              Account
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <User />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section title="Tabs (Default)">
        <Tabs defaultValue="overview" className="max-w-md">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Overview content goes here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="analytics">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Analytics content goes here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="reports">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Reports content goes here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Tabs (Line Variant)">
        <Tabs defaultValue="tab1" className="max-w-md">
          <TabsList variant="line">
            <TabsTrigger value="tab1">General</TabsTrigger>
            <TabsTrigger value="tab2">Security</TabsTrigger>
            <TabsTrigger value="tab3">Integrations</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <p className="pt-4 text-sm text-muted-foreground">
              General settings panel.
            </p>
          </TabsContent>
          <TabsContent value="tab2">
            <p className="pt-4 text-sm text-muted-foreground">
              Security settings panel.
            </p>
          </TabsContent>
          <TabsContent value="tab3">
            <p className="pt-4 text-sm text-muted-foreground">
              Integrations settings panel.
            </p>
          </TabsContent>
        </Tabs>
      </Section>
    </div>
  )
}

// ── Charts ──
function ChartsTab() {
  return (
    <div className="space-y-8">
      <Section title="Bar Chart">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Visitors</CardTitle>
            <CardDescription>Jan - Jun 2026</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={CHART_CONFIG_VISITORS} className="h-48 w-full">
              <BarChart data={MOCK_CHART_DATA} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="visitors"
                  fill="var(--color-visitors)"
                  radius={0}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </Section>

      <Section title="Line Chart">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Monthly revenue in USD</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={CHART_CONFIG_REVENUE} className="h-48 w-full">
              <LineChart data={MOCK_CHART_DATA} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </Section>

      <Section title="Area Chart (Combined)">
        <Card>
          <CardHeader>
            <CardTitle>Visitors & Revenue</CardTitle>
            <CardDescription>Combined metrics overview</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={CHART_CONFIG_COMBINED} className="h-48 w-full">
              <AreaChart data={MOCK_CHART_DATA} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  fill="var(--color-visitors)"
                  fillOpacity={0.2}
                  stroke="var(--color-visitors)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  fill="var(--color-revenue)"
                  fillOpacity={0.2}
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}

// ── Theme ──
function ThemeTab() {
  const { resolvedTheme, setTheme } = useTheme()
  const { colorTheme, setColorTheme } = useColorTheme()

  return (
    <div className="space-y-8">
      <Section title="Dark / Light Mode">
        <SectionLabel>
          Press &quot;D&quot; to toggle, or use the buttons below.
        </SectionLabel>
        <div className="flex items-center gap-2">
          <Button
            variant={resolvedTheme === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
          >
            <Sun data-icon="inline-start" />
            Light
          </Button>
          <Button
            variant={resolvedTheme === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
          >
            <Moon data-icon="inline-start" />
            Dark
          </Button>
        </div>
      </Section>

      <Section title="Color Palette">
        <SectionLabel>
          8 built-in color themes. Click to switch.
        </SectionLabel>
        <div className="flex flex-wrap gap-2">
          {COLOR_THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setColorTheme(theme.id as ColorThemeId)}
              className={`flex items-center gap-2 border px-3 py-2 text-xs transition-colors ${
                colorTheme === theme.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <span
                className="size-3 rounded-full"
                style={{ background: theme.swatch }}
              />
              {theme.label}
              {colorTheme === theme.id && <Check className="size-3" />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Theme Preview">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Primary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="size-8 bg-primary" />
                <div className="size-8 bg-primary-foreground border" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Secondary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="size-8 bg-secondary" />
                <div className="size-8 bg-secondary-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Muted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="size-8 bg-muted" />
                <div className="size-8 bg-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Accent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="size-8 bg-accent" />
                <div className="size-8 bg-accent-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Destructive</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="size-8 bg-destructive" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Chart Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                <div className="size-6 bg-chart-1" />
                <div className="size-6 bg-chart-2" />
                <div className="size-6 bg-chart-3" />
                <div className="size-6 bg-chart-4" />
                <div className="size-6 bg-chart-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  )
}

// ── Main Showcase Page ──
export default function ShowcasePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-medium">Dashacdn - Component Showcase</h1>
            <p className="text-xs text-muted-foreground">
              Next.js 16 + shadcn/ui + Tailwind CSS 4
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">v0.1.0</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="buttons" className="w-full">
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="buttons">Buttons & Badges</TabsTrigger>
            <TabsTrigger value="forms">Forms</TabsTrigger>
            <TabsTrigger value="cards">Cards & Layout</TabsTrigger>
            <TabsTrigger value="data">Data Display</TabsTrigger>
            <TabsTrigger value="overlays">Overlays</TabsTrigger>
            <TabsTrigger value="navigation">Navigation</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
          </TabsList>

          <TabsContent value="buttons">
            <ButtonsBadgesTab />
          </TabsContent>
          <TabsContent value="forms">
            <FormsTab />
          </TabsContent>
          <TabsContent value="cards">
            <CardsLayoutTab />
          </TabsContent>
          <TabsContent value="data">
            <DataDisplayTab />
          </TabsContent>
          <TabsContent value="overlays">
            <OverlaysTab />
          </TabsContent>
          <TabsContent value="navigation">
            <NavigationTab />
          </TabsContent>
          <TabsContent value="charts">
            <ChartsTab />
          </TabsContent>
          <TabsContent value="theme">
            <ThemeTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
