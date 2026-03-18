'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  BookOpen,
  GitPullRequest,
  Plus,
  ArrowRight,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/status-badge'
import { analyticsData, workflowItems, concepts } from '@/lib/mock-data'

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        {/* Hero Section */}
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-balance text-3xl font-bold tracking-tight">
            Find definitions, understand context
          </h1>
          <p className="mx-auto max-w-2xl text-pretty text-muted-foreground">
            OntoIndex makes organizational knowledge findable, understandable, and usable. Search across definitions, procedures, and policies.
          </p>
        </div>

        {/* Main Search */}
        <form onSubmit={handleSearch} className="mb-10">
          <div className="relative mx-auto max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search definitions, concepts, procedures..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-14 w-full rounded-xl bg-secondary pl-12 pr-4 text-base"
            />
          </div>
        </form>

        {/* Quick Actions */}
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          <Link href="/workflows">
            <Card className="group cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitPullRequest className="h-4 w-4 text-primary" />
                  My Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{workflowItems.length}</p>
                <p className="text-sm text-muted-foreground">Items need review</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/ontologies">
            <Card className="group cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="h-4 w-4 text-chart-2" />
                  Browse Ontologies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{analyticsData.totalConcepts}</p>
                <p className="text-sm text-muted-foreground">Total concepts</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/concepts/new">
            <Card className="group cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus className="h-4 w-4 text-chart-3" />
                  Create Definition
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Add a new concept or definition to the knowledge base
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
              <CardDescription>Your recently viewed and changed definitions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {concepts.slice(0, 5).map((concept) => (
                  <Link
                    key={concept.id}
                    href={`/concepts/${concept.id}`}
                    className="flex items-center justify-between rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-secondary/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{concept.term}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {concept.domain}
                      </p>
                    </div>
                    <StatusBadge status={concept.status} />
                  </Link>
                ))}
              </div>
              <Button variant="ghost" className="mt-4 w-full" asChild>
                <Link href="/search">
                  View all definitions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Pending Reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Pending Reviews
              </CardTitle>
              <CardDescription>Items waiting for your approval</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {workflowItems.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href={`/workflows/${item.id}`}
                    className="flex items-center justify-between rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-secondary/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{item.term}</p>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {item.changeType}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.requester} · {item.age}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </Link>
                ))}
              </div>
              <Button variant="ghost" className="mt-4 w-full" asChild>
                <Link href="/workflows">
                  View all tasks
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Stats Footer */}
        <div className="mt-10 grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-status-approved">{analyticsData.byStatus.approved}</p>
            <p className="text-sm text-muted-foreground">Approved</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-status-review">{analyticsData.byStatus['in-review']}</p>
            <p className="text-sm text-muted-foreground">In Review</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-status-draft">{analyticsData.byStatus.draft}</p>
            <p className="text-sm text-muted-foreground">Draft</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-status-deprecated">{analyticsData.byStatus.deprecated}</p>
            <p className="text-sm text-muted-foreground">Deprecated</p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
