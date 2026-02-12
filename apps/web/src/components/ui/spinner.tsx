import { LoaderIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const sizeClasses = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
} as const;

type SpinnerProps = React.ComponentProps<'svg'> & {
  size?: keyof typeof sizeClasses;
};

export function Spinner({ size = 'sm', className, ...props }: SpinnerProps) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={cn(sizeClasses[size], 'animate-spin', className)}
      {...props}
    />
  );
}
