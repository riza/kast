"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react"

const projects = [
  {
    id: "PRJ-001",
    name: "Landing Page Redesign",
    status: "In Progress",
    priority: "High",
    assignee: "AY",
    assigneeName: "Ayse Yilmaz",
    dueDate: "2026-05-15",
    progress: 65,
  },
  {
    id: "PRJ-002",
    name: "API Rate Limiting",
    status: "Done",
    priority: "Critical",
    assignee: "MK",
    assigneeName: "Mehmet Kaya",
    dueDate: "2026-04-30",
    progress: 100,
  },
  {
    id: "PRJ-003",
    name: "Database Migration",
    status: "In Review",
    priority: "High",
    assignee: "RS",
    assigneeName: "Riza Sabuncu",
    dueDate: "2026-05-20",
    progress: 90,
  },
  {
    id: "PRJ-004",
    name: "Auth Flow Refactor",
    status: "Pending",
    priority: "Medium",
    assignee: "EK",
    assigneeName: "Elif Korkmaz",
    dueDate: "2026-06-01",
    progress: 0,
  },
  {
    id: "PRJ-005",
    name: "Search Indexing",
    status: "In Progress",
    priority: "Low",
    assignee: "DT",
    assigneeName: "Deniz Tekin",
    dueDate: "2026-06-10",
    progress: 35,
  },
  {
    id: "PRJ-006",
    name: "CI/CD Pipeline Setup",
    status: "Done",
    priority: "High",
    assignee: "MK",
    assigneeName: "Mehmet Kaya",
    dueDate: "2026-04-15",
    progress: 100,
  },
  {
    id: "PRJ-007",
    name: "Payment Integration",
    status: "In Progress",
    priority: "Critical",
    assignee: "AY",
    assigneeName: "Ayse Yilmaz",
    dueDate: "2026-05-25",
    progress: 50,
  },
  {
    id: "PRJ-008",
    name: "Mobile Responsive Fixes",
    status: "Pending",
    priority: "Medium",
    assignee: "RS",
    assigneeName: "Riza Sabuncu",
    dueDate: "2026-06-15",
    progress: 0,
  },
]

const statusVariant = (status: string) => {
  switch (status) {
    case "Done":
      return "default" as const
    case "In Progress":
      return "secondary" as const
    case "In Review":
      return "outline" as const
    default:
      return "ghost" as const
  }
}

const priorityVariant = (priority: string) => {
  switch (priority) {
    case "Critical":
      return "destructive" as const
    case "High":
      return "outline" as const
    default:
      return "secondary" as const
  }
}

export default function ProjectsPage() {
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")

  const filtered = projects.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      statusFilter === "all" ||
      p.status.toLowerCase().replace(" ", "-") === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage and track your projects
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus data-icon="inline-start" />
              New Project
            </Button>
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
                <Label htmlFor="new-name">Project Name</Label>
                <Input id="new-name" placeholder="My Project" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-desc">Description</Label>
                <Textarea id="new-desc" placeholder="Describe your project..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Priority</Label>
                  <Select>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-due">Due Date</Label>
                  <Input id="new-due" type="date" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <InputGroup className="w-64">
              <InputGroupAddon align="inline-start">
                <Search className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="in-review">In Review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-muted-foreground">
              {filtered.length} project{filtered.length !== 1 && "s"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead className="text-right">Due Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-mono">{project.id}</TableCell>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(project.status)}>
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant(project.priority)}>
                      {project.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarFallback>{project.assignee}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {project.assigneeName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {project.dueDate}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
