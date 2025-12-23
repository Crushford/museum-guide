type DraftStatusBadgeProps = {
  status: 'none' | 'draft' | 'dirty';
  tooltip: string;
};

const statusConfig = {
  none: {
    icon: '✓',
    className: 'text-success',
  },
  draft: {
    icon: '○',
    className: 'text-muted',
  },
  dirty: {
    icon: '●',
    className: 'text-warning',
  },
};

export function DraftStatusBadge({ status, tooltip }: DraftStatusBadgeProps) {
  if (status === 'none') {
    return null;
  }

  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 text-xs ${config.className}`}
      title={tooltip}
    >
      {config.icon}
    </span>
  );
}
