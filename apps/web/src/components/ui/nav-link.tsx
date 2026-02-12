import Link from 'next/link';
import { cn } from '@/lib/utils';

export function NavLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        'text-muted-foreground transition-colors hover:text-foreground',
        className
      )}
      {...props}
    />
  );
}
