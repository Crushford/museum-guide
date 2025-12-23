import Link from 'next/link';

type EmptyStateProps = {
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  const ActionButton = action?.href ? Link : 'button';

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <h3 className="text-lg font-semibold text-fg mb-2">{title}</h3>
      {message && <p className="text-muted mb-6 max-w-md">{message}</p>}
      {action && (
        <ActionButton
          href={action.href}
          onClick={action.onClick}
          className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg"
        >
          {action.label}
        </ActionButton>
      )}
    </div>
  );
}
