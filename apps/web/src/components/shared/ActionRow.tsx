import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type MobileLayout = 'stack' | 'wrap' | 'grid-2';

type ActionRowProps = HTMLAttributes<HTMLDivElement> & {
  mobileLayout?: MobileLayout;
  desktopWrap?: boolean;
};

const mobileLayoutClasses: Record<MobileLayout, string> = {
  stack: 'flex flex-col',
  wrap: 'flex flex-wrap',
  'grid-2': 'grid grid-cols-2',
};

export function ActionRow({
  className,
  mobileLayout = 'stack',
  desktopWrap = true,
  ...props
}: ActionRowProps) {
  return (
    <div
      className={cn(
        'gap-2',
        mobileLayoutClasses[mobileLayout],
        'sm:flex sm:items-center',
        desktopWrap ? 'sm:flex-wrap' : 'sm:flex-nowrap',
        className
      )}
      {...props}
    />
  );
}
