import { cn } from '@/lib/utils';

export function ErrorText({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-destructive', className)} {...props} />;
}
