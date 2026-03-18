'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Plus,
  Search,
  ArrowUpDown,
  Clock,
  User,
  Hash,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ontologies } from '@/lib/mock-data'

export default function OntologiesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  const filteredOntologies = ontologies.filter((ont) =>
    ont.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ont.domain.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <AppShell
      title="Ontologies"
      actions={
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Ontology
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Search and View Toggle */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search ontologies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg border border-border bg-secondary p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="h-7 px-3 text-xs"
            >
              Grid
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="h-7 px-3 text-xs"
            >
              Table
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{ontologies.length}</p>
              <p className="text-sm text-muted-foreground">Total Ontologies</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {ontologies.reduce((sum, o) => sum + o.conceptCount, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Total Concepts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {new Set(ontologies.map((o) => o.domain)).size}
              </p>
              <p className="text-sm text-muted-foreground">Domains</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {ontologies.filter((o) => o.standard === 'MIM 2.0').length}
              </p>
              <p className="text-sm text-muted-foreground">MIM 2.0 Compliant</p>
            </CardContent>
          </Card>
        </div>

        {/* Grid View */}
        {viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOntologies.map((ontology) => (
              <Link key={ontology.id} href={`/ontologies/${ontology.id}`}>
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-secondary/50">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                        <BookOpen className="h-5 w-5 text-primary" />
                      </div>
                      <Badge variant="secondary">{ontology.standard}</Badge>
                    </div>
                    <CardTitle className="mt-3 text-base">{ontology.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {ontology.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="h-4 w-4" />
                        {ontology.conceptCount} concepts
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {ontology.owner}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Updated {ontology.lastUpdated}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          /* Table View */
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" className="h-8 gap-1 px-2 text-xs font-medium">
                      Name
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Concepts</TableHead>
                  <TableHead>Standard</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOntologies.map((ontology) => (
                  <TableRow key={ontology.id} className="cursor-pointer hover:bg-secondary/50">
                    <TableCell>
                      <Link
                        href={`/ontologies/${ontology.id}`}
                        className="font-medium hover:underline"
                      >
                        {ontology.name}
                      </Link>
                    </TableCell>
                    <TableCell>{ontology.domain}</TableCell>
                    <TableCell>{ontology.owner}</TableCell>
                    <TableCell>{ontology.conceptCount}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ontology.standard}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ontology.lastUpdated}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {filteredOntologies.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-medium">No ontologies found</h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search query.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
