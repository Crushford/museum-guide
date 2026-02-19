'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const lineClampClass: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

interface ExpandableTextProps {
  text: string;
  lines?: number;
  className?: string;
}

export function ExpandableText({
  text,
  lines = 3,
  className,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <p
        className={cn(
          'leading-relaxed whitespace-pre-wrap',
          !expanded && (lineClampClass[lines] ?? 'line-clamp-3'),
          className
        )}
      >
        {text}
      </p>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 mt-1"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? 'Show less' : 'Show more'}
      </Button>
    </div>
  );
}
