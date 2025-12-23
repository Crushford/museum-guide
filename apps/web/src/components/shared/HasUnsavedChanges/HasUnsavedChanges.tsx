'use client';

import { useState, useRef, useEffect } from 'react';

type ChildWithChanges = {
  id: number;
  name: string;
  href: string;
};

type HasUnsavedChangesProps = {
  tooltip?: string;
  childrenWithChanges?: ChildWithChanges[];
};

export function HasUnsavedChanges({
  tooltip = 'Has unsaved changes',
  childrenWithChanges = [],
}: HasUnsavedChangesProps) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    };

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopover]);

  const hasChildrenWithChanges = childrenWithChanges.length > 0;

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <button
        onClick={() => hasChildrenWithChanges && setShowPopover(!showPopover)}
        className={`inline-flex items-center gap-1.5 text-xs text-warning transition-colors ${
          hasChildrenWithChanges
            ? 'hover:text-warning/80 cursor-pointer'
            : 'cursor-default'
        }`}
        title={
          hasChildrenWithChanges
            ? `${tooltip}. Click to see children with unsaved changes.`
            : tooltip
        }
        disabled={!hasChildrenWithChanges}
      >
        <span className="inline-flex items-center justify-center w-4 h-4 text-xs">
          ●
        </span>
        <span>Unsaved changes</span>
      </button>

      {showPopover && hasChildrenWithChanges && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 z-50 bg-panel border border-border rounded-md shadow-lg min-w-[200px] max-w-[300px]"
        >
          <div className="p-3 border-b border-divider">
            <p className="text-sm font-medium text-fg">
              Children with unsaved changes
            </p>
          </div>
          <div className="p-2 max-h-64 overflow-y-auto">
            <ul className="space-y-1">
              {childrenWithChanges.map((child) => (
                <li key={child.id}>
                  <a
                    href={child.href}
                    className="block px-2 py-1.5 text-sm text-fg hover:bg-bg-2 rounded transition-colors"
                  >
                    {child.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
