'use client'

import { useState, useEffect, useRef } from 'react'
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
  History,
  X,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/status-badge'
import { analyticsData, workflowItems, concepts } from '@/lib/mock-data'

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const router = useRouter()
  const searchContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches')
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved))
      } catch (e) {}
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearch = (e?: React.FormEvent, queryOverride?: string) => {
    if (e) e.preventDefault()
    const query = (queryOverride || searchQuery).trim()
    if (query) {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5)
      setRecentSearches(updated)
      localStorage.setItem('recentSearches', JSON.stringify(updated))
      
      setIsFocused(false)
      if (queryOverride) {
        setSearchQuery(query)
      }
      router.push(`/search?q=${encodeURIComponent(query)}`)
    }
  }

  const removeRecentSearch = (e: React.MouseEvent, searchToRemove: string) => {
    e.stopPropagation()
    e.preventDefault()
    const updated = recentSearches.filter(s => s !== searchToRemove)
    setRecentSearches(updated)
    localStorage.setItem('recentSearches', JSON.stringify(updated))
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
        <div ref={searchContainerRef} className="group relative mx-auto mb-16 mt-8 max-w-3xl">
          {/* Animated gradient glow effect behind the search bar */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 opacity-30 blur-lg transition duration-500 group-focus-within:opacity-100 group-hover:opacity-75"></div>
          
          <form onSubmit={handleSearch} className="relative z-10 rounded-2xl bg-card p-2 shadow-2xl ring-1 ring-border transition-all">
            <div className="relative flex items-center">
              <Search className="absolute left-5 h-6 w-6 text-indigo-500" />
              <Input
                type="search"
                placeholder="Search definitions, concepts, procedures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                className="h-16 w-full border-0 bg-transparent pl-16 pr-36 text-lg placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button 
                type="submit" 
                size="lg"
                className="absolute right-2 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 font-semibold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
              >
                Search <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>

          {/* Recent Searches Dropdown */}
          {isFocused && recentSearches.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2">
              <div className="bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Searches
              </div>
              <ul className="py-2">
                {recentSearches.map((search, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => handleSearch(undefined, search)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-secondary/80 focus:bg-secondary/80 focus:outline-none"
                    >
                      <div className="flex items-center gap-3">
                        <History className="h-4 w-4 text-indigo-500/70" />
                        <span className="text-base font-medium">{search}</span>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => removeRecentSearch(e, search)}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

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
