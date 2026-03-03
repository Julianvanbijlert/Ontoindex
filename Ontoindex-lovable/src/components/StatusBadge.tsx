import { DefinitionStatus } from '@/lib/data';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: DefinitionStatus;
  className?: string;
}

const statusConfig: Record<DefinitionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'status-badge-draft' },
  in_review: { label: 'In Review', className: 'status-badge-review' },
  approved: { label: 'Approved', className: 'status-badge-approved' },
};

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', config.className, className)}>
      {config.label}
    </span>
  );
};
