'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Edit,
  GitPullRequest,
  Clock,
  User,
  BookOpen,
  FileText,
  Network,
  History,
  MessageSquare,
  Send,
  MoreHorizontal,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { concepts, currentUser } from '@/lib/mock-data'

const mockComments = [
  {
    id: '1',
    author: 'Jan de Vries',
    role: 'Domain Owner',
    content: 'This definition has been updated to align with the new MIM 2.0 standard requirements.',
    timestamp: '2026-03-10 14:30',
  },
  {
    id: '2',
    author: 'Lisa van der Berg',
    role: 'Architect',
    content: 'Looks good! The relationship with Customer Role is now clearer.',
    timestamp: '2026-03-11 09:15',
  },
]

const mockHistory = [
  {
    id: '1',
    action: 'Approved',
    user: 'Emma de Groot',
    timestamp: '2026-03-10',
    details: 'Approved after governance review',
  },
  {
    id: '2',
    action: 'Updated',
    user: 'Jan de Vries',
    timestamp: '2026-03-08',
    details: 'Updated short definition and examples',
  },
  {
    id: '3',
    action: 'Created',
    user: 'Jan de Vries',
    timestamp: '2026-02-15',
    details: 'Initial definition created',
  },
]

const mockProcedures = [
  { id: '1', title: 'Customer Onboarding Process', type: 'Procedure', lastUpdated: '2026-03-01' },
  { id: '2', title: 'KYC Verification Workflow', type: 'Procedure', lastUpdated: '2026-02-28' },
  { id: '3', title: 'Data Privacy Policy', type: 'Policy', lastUpdated: '2026-03-05' },
  { id: '4', title: 'Customer Data Retention Policy', type: 'Policy', lastUpdated: '2026-02-20' },
]

export default function ConceptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [comment, setComment] = useState('')
  
  const concept = concepts.find((c) => c.id === resolvedParams.id)

  if (!concept) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="mb-2 text-lg font-semibold">Concept not found</h2>
          <p className="mb-4 text-muted-foreground">The concept you are looking for does not exist.</p>
          <Button onClick={() => router.push('/search')}>Back to Search</Button>
        </div>
      </AppShell>
    )
  }

  const isEditable = currentUser.role === 'architect' || currentUser.role === 'domain-owner'

  return (
    <AppShell
      actions={
        isEditable && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button size="sm">
              <GitPullRequest className="mr-2 h-4 w-4" />
              Propose Change
            </Button>
          </div>
        )
      }
    >
      <div className="mx-auto max-w-4xl">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Header */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-bold">{concept.term}</h1>
            <StatusBadge status={concept.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {concept.domain}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {concept.owner}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Updated {concept.lastUpdated}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {concept.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="definition" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:grid-cols-none lg:justify-start">
            <TabsTrigger value="definition" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Definition</span>
            </TabsTrigger>
            <TabsTrigger value="relations" className="gap-2">
              <Network className="h-4 w-4" />
              <span className="hidden sm:inline">Relations</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          {/* Definition Tab */}
          <TabsContent value="definition" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Short Definition</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{concept.shortDefinition}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Full Definition</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed">{concept.fullDefinition}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Examples</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc space-y-2 text-muted-foreground">
                  {concept.examples.map((example, index) => (
                    <li key={index}>{example}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Comments Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  Comments
                </CardTitle>
                <CardDescription>Discussion and feedback on this definition</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {mockComments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {c.author.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.author}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.role}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{c.timestamp}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{c.content}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}

                <div className="flex gap-3 pt-4">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {currentUser.name.split(' ').map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" disabled={!comment.trim()}>
                        <Send className="mr-2 h-4 w-4" />
                        Send
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Relations Tab */}
          <TabsContent value="relations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Concepts</CardTitle>
                <CardDescription>
                  Concepts connected to {concept.term} in the ontology
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {concept.relatedConcepts.map((related) => (
                    <Link
                      key={related.id}
                      href={`/concepts/${related.id}`}
                      className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{related.term}</p>
                        <p className="text-sm text-muted-foreground">
                          Relation: <span className="text-foreground">{related.relation}</span>
                        </p>
                      </div>
                      <Badge variant="outline">{related.relation}</Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Simple Graph Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Graph Preview</CardTitle>
                <CardDescription>Visual representation of relationships</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="flex h-20 w-32 items-center justify-center rounded-lg border-2 border-primary bg-primary/10 text-center text-sm font-medium">
                      {concept.term}
                    </div>
                  </div>
                  {concept.relatedConcepts.map((related, index) => {
                    const angle = (index * 360) / concept.relatedConcepts.length
                    const radius = 100
                    const x = Math.cos((angle * Math.PI) / 180) * radius
                    const y = Math.sin((angle * Math.PI) / 180) * radius
                    return (
                      <div
                        key={related.id}
                        className="absolute flex h-14 w-28 items-center justify-center rounded-lg border border-border bg-card text-center text-xs"
                        style={{
                          left: `calc(50% + ${x}px - 56px)`,
                          top: `calc(50% + ${y}px - 28px)`,
                        }}
                      >
                        {related.term}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Procedures & Policies</CardTitle>
                <CardDescription>
                  Documents that depend on this concept
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockProcedures.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <p className="text-sm text-muted-foreground">
                            Updated {doc.lastUpdated}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{doc.type}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Version History</CardTitle>
                <CardDescription>Track changes to this definition over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative space-y-4">
                  {mockHistory.map((entry, index) => (
                    <div key={entry.id} className="relative flex gap-4 pb-4">
                      {index < mockHistory.length - 1 && (
                        <div className="absolute left-[15px] top-8 h-full w-px bg-border" />
                      )}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                        <History className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.action}</span>
                          <span className="text-muted-foreground">by {entry.user}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.details}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{entry.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
