"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import type { ChartConfig } from "@/components/ui/chart"

const trafficData = [
  { date: "Mon", desktop: 1240, mobile: 680, tablet: 230 },
  { date: "Tue", desktop: 1380, mobile: 720, tablet: 190 },
  { date: "Wed", desktop: 1520, mobile: 890, tablet: 310 },
  { date: "Thu", desktop: 1100, mobile: 950, tablet: 270 },
  { date: "Fri", desktop: 1650, mobile: 1120, tablet: 340 },
  { date: "Sat", desktop: 890, mobile: 1340, tablet: 420 },
  { date: "Sun", desktop: 720, mobile: 1180, tablet: 380 },
]

const trafficConfig: ChartConfig = {
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  mobile: { label: "Mobile", color: "var(--chart-2)" },
  tablet: { label: "Tablet", color: "var(--chart-3)" },
}

const conversionData = [
  { month: "Jan", rate: 2.8, previous: 2.1 },
  { month: "Feb", rate: 3.1, previous: 2.4 },
  { month: "Mar", rate: 2.9, previous: 2.7 },
  { month: "Apr", rate: 3.5, previous: 2.9 },
  { month: "May", rate: 3.8, previous: 3.0 },
  { month: "Jun", rate: 4.2, previous: 3.2 },
]

const conversionConfig: ChartConfig = {
  rate: { label: "This Year", color: "var(--chart-1)" },
  previous: { label: "Last Year", color: "var(--chart-4)" },
}

const performanceData = [
  { hour: "00", latency: 120, requests: 450 },
  { hour: "04", latency: 95, requests: 230 },
  { hour: "08", latency: 180, requests: 890 },
  { hour: "12", latency: 210, requests: 1250 },
  { hour: "16", latency: 190, requests: 1100 },
  { hour: "20", latency: 150, requests: 780 },
]

const performanceConfig: ChartConfig = {
  latency: { label: "Latency (ms)", color: "var(--chart-2)" },
  requests: { label: "Requests", color: "var(--chart-5)" },
}

const topPages = [
  { page: "/", views: 12450, bounce: "32%", avgTime: "2m 15s" },
  { page: "/products", views: 8320, bounce: "28%", avgTime: "3m 42s" },
  { page: "/pricing", views: 6180, bounce: "45%", avgTime: "1m 30s" },
  { page: "/blog", views: 5240, bounce: "38%", avgTime: "4m 10s" },
  { page: "/about", views: 3890, bounce: "52%", avgTime: "1m 05s" },
  { page: "/contact", views: 2150, bounce: "40%", avgTime: "2m 20s" },
]

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Traffic, conversion, and performance metrics
        </p>
      </div>

      <Tabs defaultValue="traffic">
        <TabsList variant="line">
          <TabsTrigger value="traffic">Traffic</TabsTrigger>
          <TabsTrigger value="conversion">Conversion</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="traffic" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Traffic by Device</CardTitle>
              <CardDescription>
                Weekly breakdown of visits by device type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={trafficConfig}
                className="h-72 w-full"
              >
                <AreaChart data={trafficData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="desktop"
                    fill="var(--color-desktop)"
                    fillOpacity={0.2}
                    stroke="var(--color-desktop)"
                    strokeWidth={2}
                    stackId="1"
                  />
                  <Area
                    type="monotone"
                    dataKey="mobile"
                    fill="var(--color-mobile)"
                    fillOpacity={0.2}
                    stroke="var(--color-mobile)"
                    strokeWidth={2}
                    stackId="1"
                  />
                  <Area
                    type="monotone"
                    dataKey="tablet"
                    fill="var(--color-tablet)"
                    fillOpacity={0.2}
                    stroke="var(--color-tablet)"
                    strokeWidth={2}
                    stackId="1"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Pages</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Bounce Rate</TableHead>
                    <TableHead className="text-right">Avg. Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPages.map((page) => (
                    <TableRow key={page.page}>
                      <TableCell className="font-mono">{page.page}</TableCell>
                      <TableCell className="text-right">
                        {page.views.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{page.bounce}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {page.avgTime}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversion" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Rate</CardTitle>
              <CardDescription>
                Year-over-year comparison
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={conversionConfig}
                className="h-72 w-full"
              >
                <BarChart data={conversionData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="rate" fill="var(--color-rate)" radius={0} />
                  <Bar
                    dataKey="previous"
                    fill="var(--color-previous)"
                    radius={0}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>API Performance</CardTitle>
              <CardDescription>
                Latency and request volume by hour
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={performanceConfig}
                className="h-72 w-full"
              >
                <LineChart data={performanceData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}:00`}
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="var(--color-latency)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="requests"
                    stroke="var(--color-requests)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
