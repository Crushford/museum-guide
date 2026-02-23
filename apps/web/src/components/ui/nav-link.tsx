import Link from 'next/link';
import { cn } from '@/lib/utils';

export function NavLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'text-fg-subtle transition-colors hover:text-fg',
        className
      )}
      {...props}
    />
  );
}
