import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

export function InfoBox({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg bg-raised/50 p-3 sm:flex-row sm:items-center',
        className
      )}
      {...props}
    />
  );
}
