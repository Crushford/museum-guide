'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BodyText } from '@/components/ui/body-text';

export function PlaqueSpoiler({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-brand transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Plaque text
      </button>
      {open && <BodyText wrap>{text}</BodyText>}
    </div>
  );
}
