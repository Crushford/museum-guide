import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

export function InfoBox({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg bg-raised/50',
        className
      )}
      {...props}
    />
  );
}
