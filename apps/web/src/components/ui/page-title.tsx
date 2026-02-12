import { cn } from '@/lib/utils';

export function PageTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn('text-3xl font-bold', className)} {...props} />;
}
