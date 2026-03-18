'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  X,
  MessageSquare,
  Send,
  Clock,
  User,
  FileText,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAppContext } from '@/lib/app-context'
import { cn } from '@/lib/utils'

const statusFlow: string[] = ['draft', 'in-review', 'approved']

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { workflows, concepts, updateWorkflow, updateConcept, currentUser } = useAppContext()
  const [noteText, setNoteText] = useState('')
  
  const item = workflows.find((w) => w.id === resolvedParams.id)
  const concept = concepts.find((c) => c.id === item?.conceptId)

  if (!item) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="mb-2 text-lg font-semibold text-white">Item not found</h2>
          <p className="mb-4 text-slate-400">The workflow item does not exist.</p>
          <Button onClick={() => router.push('/workflows')}>Back to Workflows</Button>
        </div>
      </AppShell>
    )
  }

  const handleAddNote = () => {
    if (!noteText.trim()) return
    const updated = {
      ...item,
      notes: [
        ...item.notes,
        {
          id: `n-${Date.now()}`,
          author: currentUser?.name || 'Anonymous',
          authorRole: currentUser?.role || 'employee',
          content: noteText,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        }
      ]
    }
    updateWorkflow(updated)
    setNoteText('')
  }

  const handleApprove = () => {
    // 1. Update workflow
    const updatedWorkflow = {
      ...item,
      status: 'approved' as any,
      notes: [
        ...item.notes,
        {
          id: `n-app-${Date.now()}`,
          author: currentUser?.name || 'Anonymous',
          authorRole: currentUser?.role || 'employee',
          content: 'Definition approved and finalized.',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        }
      ]
    }
    updateWorkflow(updatedWorkflow)

    // 2. Update concept
    if (concept) {
      const updatedConcept = {
        ...concept,
        status: 'approved' as any,
        shortDefinition: item.proposedVersion || concept.shortDefinition,
        lastUpdated: new Date().toISOString().split('T')[0]
      }
      updateConcept(updatedConcept)
    }

    alert('Approved successfully!')
    router.push('/workflows')
  }

  const handleReject = () => {
    const updatedWorkflow = {
      ...item,
      status: 'rejected' as any,
      notes: [
        ...item.notes,
        {
          id: `n-rej-${Date.now()}`,
          author: currentUser?.name || 'Anonymous',
          authorRole: currentUser?.role || 'employee',
          content: 'Definition rejected. Please review the notes.',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        }
      ]
    }
    updateWorkflow(updatedWorkflow)
    alert('Rejected successfully!')
    router.push('/workflows')
  }

  return (
    <AppShell title="Review Item">
      <div className="mx-auto max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Inbox
        </Button>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h1 className="text-2xl font-bold">{item.term}</h1>
              <StatusBadge status={item.status} />
              <PriorityBadge priority={item.priority} />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                Requested by {item.requester}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {item.age} ago
              </span>
              <Badge variant="secondary">{item.changeType}</Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Change Comparison */}
            {item.previousVersion ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Definition Comparison</CardTitle>
                  <CardDescription>
                    Review the proposed changes to this definition
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Previous Version</p>
                      <div className="rounded-lg border border-border bg-secondary/50 p-4">
                        <p className="text-sm">{item.previousVersion}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-status-approved">Proposed Version</p>
                      <div className="rounded-lg border border-status-approved/30 bg-status-approved/10 p-4">
                        <p className="text-sm">{item.proposedVersion}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Proposed Definition</CardTitle>
                  <CardDescription>New definition to be added</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-status-approved/30 bg-status-approved/10 p-4">
                    <p>{item.proposedVersion}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Conflict Warning for Merge */}
            {item.changeType === 'merge' && (
              <Card className="border-status-draft/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base text-status-draft">
                    <AlertTriangle className="h-4 w-4" />
                    Merge Proposal
                  </CardTitle>
                  <CardDescription>
                    This request proposes to merge similar definitions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The term &quot;Client&quot; has been identified as potentially redundant with &quot;Customer Legal Entity&quot;.
                    Approving this merge will:
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    <li>Mark &quot;Client&quot; as a synonym of &quot;Customer Legal Entity&quot;</li>
                    <li>Redirect all search queries for &quot;Client&quot; to the master term</li>
                    <li>Update references in connected procedures and policies</li>
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Notes & Comments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  Notes & Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  item.notes.map((n) => (
                    <div key={n.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {n.author.split(' ').map((w) => w[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{n.author}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {n.authorRole.replace('-', ' ')}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{n.timestamp}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{n.content}</p>
                      </div>
                    </div>
                  ))
                )}

                <div className="flex gap-3 border-t border-slate-800/50 pt-4">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-slate-800 text-slate-300">
                      {currentUser?.name.split(' ').map((w) => w[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <Textarea
                      placeholder="Add a note or annotation..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="min-h-[80px] resize-none border-slate-800 bg-slate-900/50 text-slate-200"
                    />
                    <Button size="sm" disabled={!noteText.trim()} onClick={handleAddNote} className="bg-indigo-600 hover:bg-indigo-700">
                      <Send className="mr-2 h-4 w-4" />
                      Add Note
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            {/* Status Flow Visualization */}
            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader>
                <CardTitle className="text-base text-slate-200">Review Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  {statusFlow.map((s, i) => (
                    <div key={s} className="flex items-center">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold transition-all',
                          s === item.status
                            ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20'
                            : statusFlow.indexOf(item.status) > i
                            ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/50'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        )}
                      >
                        {s === 'approved' ? <Check className="h-4 w-4" /> : i + 1}
                      </div>
                      {i < statusFlow.length - 1 && (
                        <div className={cn(
                          "h-px w-8 mx-1",
                          statusFlow.indexOf(item.status) > i ? "bg-emerald-500/50" : "bg-slate-800"
                        )} />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs text-slate-500 font-medium uppercase tracking-widest pt-2">
                  {item.status.replace('-', ' ')}
                </p>
              </CardContent>
            </Card>

            {/* Priority */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Priority</CardTitle>
              </CardHeader>
              <CardContent>
                <Select defaultValue={item.priority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="border-indigo-500/20 bg-indigo-500/5">
              <CardHeader>
                <CardTitle className="text-base text-indigo-300">Review Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20" disabled={item.status === 'approved'}>
                      <Check className="mr-2 h-4 w-4" />
                      Approve & Go Live
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-900 border-slate-800">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Finalize Approval?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        This will update the definition in the knowledge base. This action is recorded in the version history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        Confirm Approval
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setNoteText("Requesting more information about...")}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Request Info
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="w-full text-rose-400 hover:bg-rose-500/10 hover:text-rose-300" disabled={item.status === 'rejected'}>
                      <X className="mr-2 h-4 w-4" />
                      Reject Proposal
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-900 border-slate-800">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Reject this proposal?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        Please ensure you have added a note explaining the reasons for rejection.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReject} className="bg-rose-600 hover:bg-rose-700 text-white">
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{item.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Change type</span>
                  <span className="font-medium capitalize">{item.changeType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Concept ID</span>
                  <span className="font-mono text-xs">{item.conceptId}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
