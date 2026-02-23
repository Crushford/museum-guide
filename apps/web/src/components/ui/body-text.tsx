import { cn } from '@/lib/utils';
import { HTMLAttributes } from 'react';

type BodyTextProps = HTMLAttributes<HTMLParagraphElement> & {
  muted?: boolean;
  wrap?: boolean;
};

export function BodyText({ className, muted, wrap, ...props }: BodyTextProps) {
  return (
    <p
      className={cn(
        'leading-relaxed',
        muted ? 'text-muted-foreground' : 'text-primary',
        wrap && 'whitespace-pre-wrap',
        className
      )}
      {...props}
    />
  );
}
