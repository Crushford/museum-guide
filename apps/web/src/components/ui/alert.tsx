import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva('rounded-md border p-3 text-sm', {
  variants: {
    variant: {
      destructive: 'bg-destructive/10 border-destructive/30 text-destructive',
      warning: 'bg-warning/20 border-warning/30 text-warning',
    },
  },
  defaultVariants: {
    variant: 'destructive',
  },
});

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

export { Alert, alertVariants };
