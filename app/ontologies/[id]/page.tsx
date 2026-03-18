'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  User,
  Clock,
  Hash,
  Edit,
  FileText,
  Network,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/status-badge'
import { ontologies, concepts } from '@/lib/mock-data'

export default function OntologyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()

  const ontology = ontologies.find((o) => o.id === resolvedParams.id)
  const ontologyConcepts = concepts.filter((c) => c.ontology === ontology?.name)

  if (!ontology) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="mb-2 text-lg font-semibold">Ontology not found</h2>
          <p className="mb-4 text-muted-foreground">The ontology does not exist.</p>
          <Button onClick={() => router.push('/ontologies')}>Back to Ontologies</Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      actions={
        <Button variant="outline" size="sm">
          <Edit className="mr-2 h-4 w-4" />
          Edit Ontology
        </Button>
      }
    >
      <div className="mx-auto max-w-5xl">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Header */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{ontology.name}</h1>
              <Badge variant="secondary">{ontology.standard}</Badge>
            </div>
          </div>
          <p className="text-muted-foreground">{ontology.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {ontology.domain}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {ontology.owner}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-4 w-4" />
              {ontology.conceptCount} concepts
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Updated {ontology.lastUpdated}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Concepts List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Concepts in this Ontology
                </CardTitle>
                <CardDescription>
                  {ontologyConcepts.length} concepts defined
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ontologyConcepts.map((concept) => (
                    <Link
                      key={concept.id}
                      href={`/concepts/${concept.id}`}
                      className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{concept.term}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {concept.shortDefinition}
                        </p>
                      </div>
                      <StatusBadge status={concept.status} />
                    </Link>
                  ))}
                  {ontologyConcepts.length === 0 && (
                    <p className="py-8 text-center text-muted-foreground">
                      No concepts in this ontology yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Graph Preview */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Network className="h-4 w-4" />
                  Graph Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30">
                  <div className="text-center">
                    <Network className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Interactive graph view
                    </p>
                    <Button variant="outline" size="sm" className="mt-2">
                      Open Graph
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total concepts</span>
                  <span className="font-medium">{ontology.conceptCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="font-medium text-status-approved">
                    {ontologyConcepts.filter((c) => c.status === 'approved').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">In review</span>
                  <span className="font-medium text-status-review">
                    {ontologyConcepts.filter((c) => c.status === 'in-review').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Draft</span>
                  <span className="font-medium text-status-draft">
                    {ontologyConcepts.filter((c) => c.status === 'draft').length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
