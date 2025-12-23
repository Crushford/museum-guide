import Link from 'next/link';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && (
            <span className="text-subtle" aria-hidden="true">
              /
            </span>
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="text-muted hover:text-accent transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-fg">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
