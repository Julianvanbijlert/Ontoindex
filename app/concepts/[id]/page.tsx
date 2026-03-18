'use client'

import { useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useAppContext } from '@/lib/app-context'
import { Download, Heart, HeartOff, Share2, Star, StarOff } from 'lucide-react'

const mockHistory = [

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
  const { 
    concepts, 
    currentUser, 
    addComment, 
    updateConcept, 
    addWorkflow, 
    toggleFavourite, 
    isFavourite 
  } = useAppContext()
  
  const [commentText, setCommentText] = useState('')
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  
  const concept = concepts.find((c) => c.id === resolvedParams.id)

  const [editTerm, setEditTerm] = useState(concept?.term || '')
  const [editShortDef, setEditShortDef] = useState(concept?.shortDefinition || '')
  const [editFullDef, setEditFullDef] = useState(concept?.fullDefinition || '')

  if (!concept) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="mb-2 text-lg font-semibold text-white">Concept not found</h2>
          <p className="mb-4 text-slate-400">The concept you are looking for does not exist.</p>
          <Button onClick={() => router.push('/search')}>Back to Search</Button>
        </div>
      </AppShell>
    )
  }

  const isEditable = currentUser?.role === 'architect' || currentUser?.role === 'domain-owner'

  const handleAddComment = () => {
    if (!commentText.trim()) return
    addComment(concept.id, commentText)
    setCommentText('')
  }

  const handleSaveEdit = () => {
    const updated = {
      ...concept,
      term: editTerm,
      shortDefinition: editShortDef,
      fullDefinition: editFullDef,
      lastUpdated: new Date().toISOString().split('T')[0]
    }
    updateConcept(updated)
    setEditDialogOpen(false)

    // Also add to workflow
    addWorkflow({
      id: `w-rev-${Date.now()}`,
      conceptId: concept.id,
      term: editTerm,
      type: 'definition',
      changeType: 'update',
      requester: currentUser?.name || 'Anonymous',
      requesterRole: currentUser?.role || 'employee',
      age: 'Just now',
      status: 'in-review',
      priority: 'high',
      notes: [{
        id: `n-${Date.now()}`,
        author: currentUser?.name || 'Anonymous',
        authorRole: currentUser?.role || 'employee',
        content: 'Requested edit pending architect approval.',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
      }],
      proposedVersion: editShortDef
    })

    addComment(concept.id, "Requested edit pending")
  }

  const handleExport = () => {
    const data = JSON.stringify(concept, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${concept.term.toLowerCase().replace(/\s+/g, '_')}_definition.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleShare = () => {
    alert(`Link copied: ${window.location.href}`)
  }

  return (
    <AppShell
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => toggleFavourite(concept.id)}>
            {isFavourite(concept.id) ? (
              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
            ) : (
              <Star className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleExport}>
            <Download className="h-4 w-4" />
          </Button>
          {isEditable && (
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Concept
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-slate-800 bg-slate-900/95 backdrop-blur-xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Edit Concept: {concept.term}</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Your changes will be submitted for review before going live.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="term" className="text-slate-300">Term</Label>
                    <Input 
                      id="term" 
                      value={editTerm} 
                      onChange={(e) => setEditTerm(e.target.value)} 
                      className="border-slate-700 bg-slate-800/50 text-white"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="short" className="text-slate-300">Short Definition</Label>
                    <Textarea 
                      id="short" 
                      value={editShortDef} 
                      onChange={(e) => setEditShortDef(e.target.value)} 
                      className="min-h-[80px] border-slate-700 bg-slate-800/50 text-white"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="full" className="text-slate-300">Full Definition</Label>
                    <Textarea 
                      id="full" 
                      value={editFullDef} 
                      onChange={(e) => setEditFullDef(e.target.value)} 
                      className="min-h-[160px] border-slate-700 bg-slate-800/50 text-white"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    Submit for Approval
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
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
                {(concept.comments || []).map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-indigo-500/20 text-indigo-400">
                        {c.author.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{c.author}</span>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-[10px]">
                          {c.role}
                        </Badge>
                        <span className="text-xs text-slate-500">{c.timestamp}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">{c.content}</p>
                    </div>
                  </div>
                ))}

                {(!concept.comments || concept.comments.length === 0) && (
                  <p className="text-center text-sm text-slate-500 py-4 italic">No comments yet. Start the discussion!</p>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                  <Avatar className="h-8 w-8 ring-2 ring-indigo-500/20">
                    <AvatarFallback className="text-xs bg-slate-800 text-slate-300">
                      {currentUser?.name.split(' ').map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="min-h-[80px] resize-none border-slate-800 bg-slate-900/50 text-slate-200 placeholder:text-slate-500"
                    />
                    <div className="flex justify-end">
                      <Button 
                        size="sm" 
                        disabled={!commentText.trim()} 
                        onClick={handleAddComment}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
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

            {/* Enhanced Graph Preview */}
            <Card className="border-slate-800 bg-slate-900/40 overflow-hidden">
              <CardHeader className="bg-slate-950/20">
                <CardTitle className="text-base text-slate-200">Interactive Knowledge Graph</CardTitle>
                <CardDescription>Visual map of {concept.term} and its dependencies</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative h-[400px] overflow-hidden bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]">
                  {/* Central Node */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 scale-110">
                    <div className="flex h-24 w-36 items-center justify-center rounded-2xl border-2 border-indigo-500 bg-slate-900 px-3 text-center text-sm font-bold text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                      {concept.term}
                    </div>
                  </div>

                  {/* Connected Nodes */}
                  {concept.relatedConcepts.map((related, index) => {
                    const angle = (index * 360) / concept.relatedConcepts.length
                    const radius = 140
                    const x = Math.cos((angle * Math.PI) / 180) * radius
                    const y = Math.sin((angle * Math.PI) / 180) * radius
                    
                    // Simple line using SVG if I had more space, using CSS border for lines is tricky
                    // Just placing nodes for now with better visual style
                    
                    return (
                      <Link
                        key={related.id}
                        href={`/concepts/${related.id}`}
                        className="absolute flex h-16 w-32 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 px-2 text-center text-xs font-medium text-slate-300 shadow-lg transition-all hover:scale-105 hover:border-indigo-400 hover:text-white"
                        style={{
                          left: `calc(50% + ${x}px - 64px)`,
                          top: `calc(50% + ${y}px - 32px)`,
                        }}
                      >
                        <div className="space-y-1">
                          <div className="font-bold">{related.term}</div>
                          <div className="text-[10px] text-slate-500 uppercase">{related.relation}</div>
                        </div>
                      </Link>
                    )
                  })}

                  {/* Connecting lines proxy (central to each node) */}
                  <div className="absolute inset-0 pointer-events-none opacity-20">
                    <svg className="h-full w-full">
                      {concept.relatedConcepts.map((related, index) => {
                        const angle = (index * 360) / concept.relatedConcepts.length
                        const radius = 140
                        const x = Math.cos((angle * Math.PI) / 180) * radius
                        const y = Math.sin((angle * Math.PI) / 180) * radius
                        return (
                          <line 
                            key={`line-${index}`}
                            x1="50%" y1="50%" 
                            x2={`calc(50% + ${x}px)`} 
                            y2={`calc(50% + ${y}px)`} 
                            className="stroke-indigo-500"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                          />
                        )
                      })}
                    </svg>
                  </div>
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
