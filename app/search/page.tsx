'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  Filter,
  FileText,
  BookOpen,
  Database,
  X,
  Sparkles,
  Text,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { concepts, domains, statusOptions, type Status } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

function SearchPageContent() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  
  const [query, setQuery] = useState(initialQuery)
  const [searchMode, setSearchMode] = useState<'exact' | 'semantic'>('semantic')
  const [domainFilter, setDomainFilter] = useState('All domains')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [tagFilter, setTagFilter] = useState('All tags')
  const [showFilters, setShowFilters] = useState(false)

  const tags = useMemo(() => {
    const tagSet = new Set<string>()
    concepts.forEach((concept) => concept.tags.forEach((tag) => tagSet.add(tag)))
    return ['All tags', ...Array.from(tagSet).sort()]
  }, [])

  const filteredConcepts = useMemo(() => {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const getUniqueWords = (value: string) => {
      const clean = normalize(value)
      return new Set(clean.split(' ').filter(Boolean))
    }

    const wordOverlap = (a: Set<string>, b: Set<string>) => {
      let overlap = 0
      a.forEach((word) => {
        if (b.has(word)) overlap += 1
      })
      return overlap
    }

    const getSemanticScore = (concept: (typeof concepts)[number], value: string) => {
      const normalized = normalize(value)
      if (!normalized) return 0

      const queryWords = getUniqueWords(normalized)
      const termWords = getUniqueWords(concept.term)
      const shortDefWords = getUniqueWords(concept.shortDefinition)
      const fullDefWords = getUniqueWords(concept.fullDefinition)
      const tagsWords = getUniqueWords(concept.tags.join(' '))

      let score = 0
      if (concept.term.toLowerCase() === normalized) score += 80
      if (concept.term.toLowerCase().includes(normalized)) score += 40
      if (concept.shortDefinition.toLowerCase().includes(normalized)) score += 35
      if (concept.fullDefinition.toLowerCase().includes(normalized)) score += 30
      if (concept.tags.some((tag) => tag.toLowerCase().includes(normalized))) score += 20

      score += wordOverlap(queryWords, termWords) * 12
      score += wordOverlap(queryWords, shortDefWords) * 8
      score += wordOverlap(queryWords, fullDefWords) * 6
      score += wordOverlap(queryWords, tagsWords) * 5

      const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
      return normalizedScore
    }

    const isExactMatch = (concept: (typeof concepts)[number], value: string) => {
      const normalized = value.toLowerCase().trim()
      if (!normalized) return true
      return (
        concept.term.toLowerCase().includes(normalized) ||
        concept.shortDefinition.toLowerCase().includes(normalized) ||
        concept.fullDefinition.toLowerCase().includes(normalized) ||
        concept.tags.some((tag) => tag.toLowerCase().includes(normalized))
      )
    }

    const result = concepts
      .map((concept) => {
        const score = query
          ? searchMode === 'exact'
            ? isExactMatch(concept, query)
              ? 1
              : 0
            : getSemanticScore(concept, query)
          : 1
        return { concept, score }
      })
      .filter(({ concept, score }) => {
        if (score <= 0) return false

        if (domainFilter !== 'All domains' && concept.domain !== domainFilter) return false
        if (statusFilter !== 'all' && concept.status !== statusFilter) return false
        if (tagFilter !== 'All tags' && !concept.tags.includes(tagFilter)) return false

        if (query && searchMode === 'semantic') {
          return score >= 15
        }

        return true
      })

    const sorted = result
      .sort((a, b) => b.score - a.score)
      .map((item) => item)

    return sorted
  }, [query, domainFilter, statusFilter, tagFilter, searchMode])

  const clearFilters = () => {
    setDomainFilter('All domains')
    setStatusFilter('all')
    setTagFilter('All tags')
  }

  const hasActiveFilters =
    domainFilter !== 'All domains' || statusFilter !== 'all' || tagFilter !== 'All tags'

  return (
    <AppShell title="Search">
      <div className="mx-auto max-w-4xl">
        {/* Search Bar */}
        <div className="mb-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search definitions, concepts, procedures..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 w-full bg-secondary pl-12 pr-4 text-base"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Search Mode Toggle */}
            <ToggleGroup
              type="single"
              value={searchMode}
              onValueChange={(value) => value && setSearchMode(value as 'exact' | 'semantic')}
              className="rounded-lg border border-border bg-secondary p-1"
            >
              <ToggleGroupItem
                value="exact"
                className={cn(
                  'gap-2 rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-sm'
                )}
              >
                <Text className="h-4 w-4" />
                Exact
              </ToggleGroupItem>
              <ToggleGroupItem
                value="semantic"
                className={cn(
                  'gap-2 rounded-md px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-sm'
                )}
              >
                <Sparkles className="h-4 w-4" />
                Semantic
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  Clear filters
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={showFilters ? 'bg-secondary' : ''}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">
                    {(domainFilter !== 'All domains' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (tagFilter !== 'All tags' ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <Card>
              <CardContent className="grid gap-4 p-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Domain</label>
                  <Select value={domainFilter} onValueChange={setDomainFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain} value={domain}>
                          {domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | 'all')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                        <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select defaultValue="all">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="definition">Definition</SelectItem>
                      <SelectItem value="procedure">Procedure</SelectItem>
                      <SelectItem value="policy">Policy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tag</label>
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-2 text-sm text-muted-foreground">
          {filteredConcepts.length} result{filteredConcepts.length !== 1 ? 's' : ''}
          {query && ` for "${query}"`}
        </div>
        {searchMode === 'semantic' && query && (
          <div className="mb-4 rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            Semantic scoring boosts matches that are close to concept term and definitions.
          </div>
        )}

        {/* Results List */}
        <div className="space-y-3">
          {filteredConcepts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No results found</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Try adjusting your search or filters to find what you are looking for.
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear all filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            filteredConcepts.map(({ concept, score }) => (
              <Link key={concept.id} href={`/concepts/${concept.id}`}>
                <Card className="transition-colors hover:border-primary/50 hover:bg-secondary/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="font-semibold">{concept.term}</h3>
                          <StatusBadge status={concept.status} />
                          {searchMode === 'semantic' && query && (
                            <Badge variant="secondary" className="text-[10px] font-medium">
                              Score {Math.max(1, score)}/100
                            </Badge>
                          )}
                        </div>
                        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                          {concept.shortDefinition}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {concept.domain}
                          </span>
                          {concept.procedures > 0 && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <FileText className="h-3 w-3" />
                              {concept.procedures} procedure{concept.procedures !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {concept.policies > 0 && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <FileText className="h-3 w-3" />
                              {concept.policies} polic{concept.policies !== 1 ? 'ies' : 'y'}
                            </Badge>
                          )}
                          {concept.systems > 0 && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Database className="h-3 w-3" />
                              {concept.systems} system{concept.systems !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<AppShell title="Search"><div className="flex items-center justify-center py-12">Loading...</div></AppShell>}>
      <SearchPageContent />
    </Suspense>
  )
}
