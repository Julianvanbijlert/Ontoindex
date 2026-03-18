import { cn } from '@/lib/utils'
import type { Status, Priority } from '@/lib/mock-data'

const statusStyles: Record<Status, string> = {
  approved: 'bg-status-approved/20 text-status-approved border-status-approved/30',
  'in-review': 'bg-status-review/20 text-status-review border-status-review/30',
  draft: 'bg-status-draft/20 text-status-draft border-status-draft/30',
  rejected: 'bg-status-rejected/20 text-status-rejected border-status-rejected/30',
  deprecated: 'bg-status-deprecated/20 text-status-deprecated border-status-deprecated/30',
}

const statusLabels: Record<Status, string> = {
  approved: 'Approved',
  'in-review': 'In Review',
  draft: 'Draft',
  rejected: 'Rejected',
  deprecated: 'Deprecated',
}

const priorityStyles: Record<Priority, string> = {
  high: 'bg-destructive/20 text-destructive border-destructive/30',
  normal: 'bg-muted text-muted-foreground border-border',
  low: 'bg-secondary text-secondary-foreground border-border',
}

const priorityLabels: Record<Priority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low',
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        statusStyles[status],
        className
      )}
    >
      {statusLabels[status]}
    </span>
  )
}

interface PriorityBadgeProps {
  priority: Priority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        priorityStyles[priority],
        className
      )}
    >
      {priorityLabels[priority]}
    </span>
  )
}
