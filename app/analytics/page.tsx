'use client'

import Link from 'next/link'
import {
  BarChart3,
  TrendingUp,
  Search,
  AlertTriangle,
  Eye,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { analyticsData } from '@/lib/mock-data'

export default function AnalyticsPage() {
  const total = analyticsData.totalConcepts
  const approvedPercent = (analyticsData.byStatus.approved / total) * 100

  return (
    <AppShell title="Analytics">
      <div className="space-y-6">
        {/* Overview Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Concepts</CardDescription>
              <CardTitle className="flex items-baseline gap-2 text-3xl">
                {analyticsData.totalConcepts}
                <span className="flex items-center text-sm font-normal text-status-approved">
                  <ArrowUpRight className="h-4 w-4" />
                  12%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">+24 from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approval Rate</CardDescription>
              <CardTitle className="flex items-baseline gap-2 text-3xl">
                {approvedPercent.toFixed(0)}%
                <span className="flex items-center text-sm font-normal text-status-approved">
                  <ArrowUpRight className="h-4 w-4" />
                  3%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={approvedPercent} className="h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Reviews</CardDescription>
              <CardTitle className="flex items-baseline gap-2 text-3xl">
                {analyticsData.byStatus['in-review']}
                <span className="flex items-center text-sm font-normal text-status-draft">
                  <ArrowDownRight className="h-4 w-4" />
                  5%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">-2 from last week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Search Queries (30d)</CardDescription>
              <CardTitle className="flex items-baseline gap-2 text-3xl">
                1,247
                <span className="flex items-center text-sm font-normal text-status-approved">
                  <ArrowUpRight className="h-4 w-4" />
                  18%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">+189 from last month</p>
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Concepts by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-status-approved" />
                    Approved
                  </span>
                  <span className="font-medium">{analyticsData.byStatus.approved}</span>
                </div>
                <Progress
                  value={(analyticsData.byStatus.approved / total) * 100}
                  className="h-3 [&>div]:bg-status-approved"
                />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-status-review" />
                    In Review
                  </span>
                  <span className="font-medium">{analyticsData.byStatus['in-review']}</span>
                </div>
                <Progress
                  value={(analyticsData.byStatus['in-review'] / total) * 100}
                  className="h-3 [&>div]:bg-status-review"
                />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-status-draft" />
                    Draft
                  </span>
                  <span className="font-medium">{analyticsData.byStatus.draft}</span>
                </div>
                <Progress
                  value={(analyticsData.byStatus.draft / total) * 100}
                  className="h-3 [&>div]:bg-status-draft"
                />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-status-deprecated" />
                    Deprecated
                  </span>
                  <span className="font-medium">{analyticsData.byStatus.deprecated}</span>
                </div>
                <Progress
                  value={(analyticsData.byStatus.deprecated / total) * 100}
                  className="h-3 [&>div]:bg-status-deprecated"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Search Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                Top Search Queries
              </CardTitle>
              <CardDescription>Most searched terms in the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData.topSearchQueries.map((query, index) => (
                  <div key={query.query} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="flex-1 font-medium">{query.query}</span>
                    <Badge variant="secondary">{query.count} searches</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* No Results Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-status-draft" />
                No Results Queries
              </CardTitle>
              <CardDescription>
                Searches that returned zero approved concepts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData.noResultQueries.map((query) => (
                  <div
                    key={query.query}
                    className="flex items-center justify-between rounded-lg border border-dashed border-status-draft/50 bg-status-draft/5 p-3"
                  >
                    <span className="font-medium">{query.query}</span>
                    <Badge variant="outline" className="border-status-draft/30 text-status-draft">
                      {query.count} searches
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Consider adding definitions for these commonly searched terms.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Top Viewed Concepts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Most Viewed Concepts
            </CardTitle>
            <CardDescription>Top 5 concepts by view count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.topViewedConcepts.map((concept, index) => (
                <Link
                  key={concept.id}
                  href={`/concepts/${concept.id}`}
                  className="flex items-center gap-4 rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-secondary/50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-sm font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{concept.term}</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    {concept.views.toLocaleString()} views
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <span className="capitalize">{activity.type}</span>:{' '}
                    <span className="font-medium">{activity.term}</span>
                  </div>
                  <span className="text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
