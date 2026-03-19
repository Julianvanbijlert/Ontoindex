export const workflowStatusConfig = {
  draft: {
    label: "Draft",
    badgeClass: "bg-muted text-muted-foreground",
    nodeStyle: {
      background: "hsl(var(--muted))",
      borderColor: "hsl(var(--border))",
      color: "hsl(var(--muted-foreground))",
    },
  },
  in_review: {
    label: "In Review",
    badgeClass: "bg-warning/10 text-warning border-warning/20",
    nodeStyle: {
      background: "hsl(var(--warning) / 0.14)",
      borderColor: "hsl(var(--warning) / 0.5)",
      color: "hsl(var(--foreground))",
    },
  },
  approved: {
    label: "Approved",
    badgeClass: "bg-success/10 text-success border-success/20",
    nodeStyle: {
      background: "hsl(var(--success) / 0.14)",
      borderColor: "hsl(var(--success) / 0.55)",
      color: "hsl(var(--foreground))",
    },
  },
  rejected: {
    label: "Rejected",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    nodeStyle: {
      background: "hsl(var(--destructive) / 0.14)",
      borderColor: "hsl(var(--destructive) / 0.55)",
      color: "hsl(var(--foreground))",
    },
  },
  archived: {
    label: "Archived",
    badgeClass: "bg-muted text-muted-foreground",
    nodeStyle: {
      background: "hsl(var(--muted))",
      borderColor: "hsl(var(--border))",
      color: "hsl(var(--muted-foreground))",
    },
  },
} as const;

export function getWorkflowStatusMeta(status: string) {
  return workflowStatusConfig[status as keyof typeof workflowStatusConfig] || workflowStatusConfig.draft;
}

export function getWorkflowNodeStyle(status: string) {
  const meta = getWorkflowStatusMeta(status);

  return {
    background: meta.nodeStyle.background,
    border: `1px solid ${meta.nodeStyle.borderColor}`,
    color: meta.nodeStyle.color,
  };
}

