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
import { workflowItems, currentUser, type Status } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const statusFlow: Status[] = ['draft', 'in-review', 'approved']

export default function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<Status>('in-review')

  const item = workflowItems.find((w) => w.id === resolvedParams.id)

  if (!item) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="mb-2 text-lg font-semibold">Item not found</h2>
          <p className="mb-4 text-muted-foreground">The workflow item does not exist.</p>
          <Button onClick={() => router.push('/workflows')}>Back to Workflows</Button>
        </div>
      </AppShell>
    )
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

                <div className="flex gap-3 border-t border-border pt-4">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {currentUser.name.split(' ').map((w) => w[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <Textarea
                      placeholder="Add a note or annotation..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                    <Button size="sm" disabled={!note.trim()}>
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
            {/* Status Control */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in-review">In Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>

                {/* Status Flow Visualization */}
                <div className="flex items-center justify-between">
                  {statusFlow.map((s, i) => (
                    <div key={s} className="flex items-center">
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                          s === status
                            ? 'bg-primary text-primary-foreground'
                            : statusFlow.indexOf(status) > i
                            ? 'bg-status-approved/20 text-status-approved'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {i + 1}
                      </div>
                      {i < statusFlow.length - 1 && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
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
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="w-full bg-status-approved text-white hover:bg-status-approved/90">
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve this definition?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will approve the proposed changes and make them visible to all users.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-status-approved hover:bg-status-approved/90">
                        Approve
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button variant="outline" className="w-full">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Request Info
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10">
                      <X className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject this definition?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Please add a note explaining why this is being rejected before confirming.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive hover:bg-destructive/90">
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
