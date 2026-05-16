import type { ChartConfig } from "@/components/ui/chart"

export const MOCK_PROJECTS = [
  {
    id: "PRJ-001",
    name: "Landing Page Redesign",
    status: "In Progress",
    priority: "High",
    assignee: "AY",
    dueDate: "2026-05-15",
  },
  {
    id: "PRJ-002",
    name: "API Rate Limiting",
    status: "Done",
    priority: "Critical",
    assignee: "MK",
    dueDate: "2026-04-30",
  },
  {
    id: "PRJ-003",
    name: "Database Migration",
    status: "In Review",
    priority: "High",
    assignee: "RS",
    dueDate: "2026-05-20",
  },
  {
    id: "PRJ-004",
    name: "Auth Flow Refactor",
    status: "Pending",
    priority: "Medium",
    assignee: "EK",
    dueDate: "2026-06-01",
  },
  {
    id: "PRJ-005",
    name: "Search Indexing",
    status: "In Progress",
    priority: "Low",
    assignee: "DT",
    dueDate: "2026-06-10",
  },
] as const

export const MOCK_USERS = [
  { initials: "AY", name: "Ayse Yilmaz" },
  { initials: "MK", name: "Mehmet Kaya" },
  { initials: "RS", name: "Riza Sabuncu" },
  { initials: "EK", name: "Elif Korkmaz" },
  { initials: "DT", name: "Deniz Tekin" },
] as const

export const MOCK_CHART_DATA = [
  { month: "Jan", visitors: 1200, revenue: 4200 },
  { month: "Feb", visitors: 1900, revenue: 5800 },
  { month: "Mar", visitors: 2400, revenue: 7100 },
  { month: "Apr", visitors: 1800, revenue: 6300 },
  { month: "May", visitors: 3100, revenue: 9400 },
  { month: "Jun", visitors: 2700, revenue: 8200 },
]

export const CHART_CONFIG_VISITORS: ChartConfig = {
  visitors: {
    label: "Visitors",
    color: "var(--chart-1)",
  },
}

export const CHART_CONFIG_REVENUE: ChartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-2)",
  },
}

export const CHART_CONFIG_COMBINED: ChartConfig = {
  visitors: {
    label: "Visitors",
    color: "var(--chart-1)",
  },
  revenue: {
    label: "Revenue",
    color: "var(--chart-3)",
  },
}

export const MOCK_COMMANDS = [
  { group: "Pages", items: ["Dashboard", "Settings", "Profile", "Analytics"] },
  {
    group: "Actions",
    items: ["Create Project", "Invite Member", "Export Data", "Toggle Theme"],
  },
]

export const MOCK_NOTIFICATIONS = [
  {
    title: "Deployment Successful",
    description: "v2.1.0 deployed to production",
    time: "2 min ago",
  },
  {
    title: "New Team Member",
    description: "Elif joined the engineering team",
    time: "1 hour ago",
  },
  {
    title: "Build Failed",
    description: "CI pipeline failed on main branch",
    time: "3 hours ago",
  },
]
