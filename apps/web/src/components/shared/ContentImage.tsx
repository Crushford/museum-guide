import { cn } from '@/lib/utils';
import type { ImgHTMLAttributes } from 'react';

type ContentImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'className'
> & {
  className?: string;
  wrapperClassName?: string;
  fit?: 'contain' | 'cover';
  maxHeightClassName?: string;
};

export function ContentImage({
  alt,
  className,
  fit = 'contain',
  maxHeightClassName = 'max-h-[60vh]',
  src,
  wrapperClassName,
  ...props
}: ContentImageProps) {
  return (
    <div
      className={cn(
        'flex w-full justify-center overflow-hidden rounded-lg bg-raised',
        wrapperClassName
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn(
          'block max-w-full',
          fit === 'contain'
            ? cn('h-auto w-auto object-contain', maxHeightClassName)
            : 'h-auto w-full object-cover',
          className
        )}
        {...props}
      />
    </div>
  );
}
