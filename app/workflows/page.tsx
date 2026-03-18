'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Filter,
  ArrowUpDown,
  Clock,
  GitMerge,
  Plus,
  RefreshCw,
  FileEdit,
  Archive,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, PriorityBadge } from '@/components/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { workflowItems, statusOptions, type Status } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const changeTypeIcons = {
  new: Plus,
  update: FileEdit,
  merge: GitMerge,
  deprecate: Archive,
}

const changeTypeLabels = {
  new: 'New',
  update: 'Update',
  merge: 'Merge',
  deprecate: 'Deprecate',
}

export default function WorkflowsPage() {
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')

  const filteredItems = workflowItems.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false
    return true
  })

  const pendingCount = workflowItems.filter((w) => w.status === 'in-review').length
  const draftCount = workflowItems.filter((w) => w.status === 'draft').length

  return (
    <AppShell title="Workflow Inbox">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-review/20">
                  <Clock className="h-5 w-5 text-status-review" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-draft/20">
                  <FileEdit className="h-5 w-5 text-status-draft" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{draftCount}</p>
                  <p className="text-sm text-muted-foreground">Draft</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/20">
                  <RefreshCw className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {workflowItems.filter((w) => w.priority === 'high').length}
                  </p>
                  <p className="text-sm text-muted-foreground">High Priority</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <GitMerge className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{workflowItems.length}</p>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | 'all')}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
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
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">
                  <Button variant="ghost" className="h-8 gap-1 px-2 text-xs font-medium">
                    Term
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No workflow items match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const ChangeIcon = changeTypeIcons[item.changeType]
                  return (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-secondary/50">
                      <TableCell>
                        <Link href={`/workflows/${item.id}`} className="font-medium hover:underline">
                          {item.term}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {item.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ChangeIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{changeTypeLabels[item.changeType]}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {item.requester}
                          <p className="text-xs text-muted-foreground">
                            {item.requesterRole.replace('-', ' ')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.age}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={item.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  )
}
