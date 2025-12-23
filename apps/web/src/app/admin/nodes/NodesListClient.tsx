'use client';

import { useEffect, useState } from 'react';
import { EntityList } from '../../../components/shared';

import { ReactNode } from 'react';

type Item = {
  id: number;
  name: string;
  subtitle?: string;
  href: string;
  typePill: string;
  parentId: number | null;
};

type ChildWithChanges = {
  id: number;
  name: string;
  href: string;
};

function checkNodeHasUnsavedChanges(nodeId: number): boolean {
  const draft = localStorage.getItem(`node-draft-${nodeId}`);
  if (draft) {
    try {
      const parsed = JSON.parse(draft);
      return parsed.isDirty === true;
    } catch {
      return false;
    }
  }
  return false;
}

function findChildrenWithChanges(
  parentId: number,
  allItems: Item[]
): ChildWithChanges[] {
  const childrenWithChanges: ChildWithChanges[] = [];

  allItems.forEach((item) => {
    // Check if this item is a child of the parent
    if (item.parentId === parentId && checkNodeHasUnsavedChanges(item.id)) {
      childrenWithChanges.push({
        id: item.id,
        name: item.name,
        href: item.href,
      });
    }
  });

  return childrenWithChanges;
}

type NodesListClientProps = {
  items: Item[];
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  emptyState?: ReactNode;
};

export function NodesListClient({
  items,
  primaryAction,
  emptyState,
}: NodesListClientProps) {
  const [itemsWithStatus, setItemsWithStatus] = useState<
    Array<
      Item & {
        hasUnsavedChanges: boolean;
        childrenWithChanges: ChildWithChanges[];
      }
    >
  >([]);

  useEffect(() => {
    const itemsWithStatus = items.map((item) => {
      const hasUnsavedChanges = checkNodeHasUnsavedChanges(item.id);
      const childrenWithChanges = hasUnsavedChanges
        ? findChildrenWithChanges(item.id, items)
        : [];

      return {
        ...item,
        hasUnsavedChanges,
        childrenWithChanges,
      };
    });
    setItemsWithStatus(itemsWithStatus);
  }, [items]);

  return (
    <EntityList
      title=""
      items={itemsWithStatus.map((item) => ({
        id: item.id,
        name: item.name,
        subtitle: item.subtitle,
        href: item.href,
        typePill: item.typePill,
        hasUnsavedChanges: item.hasUnsavedChanges,
        childrenWithChanges: item.childrenWithChanges,
      }))}
      primaryAction={primaryAction}
      emptyState={emptyState}
    />
  );
}
