'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type ContentRow = {
  id: number;
  type: string | null;
  text: string;
  createdAt: string;
  museumId: number | null;
  roomId: number | null;
  artifactId: number | null;
};

type ContentTabsClientProps = {
  museums: unknown[];
  rooms: unknown[];
  artifacts: unknown[];
  content: ContentRow[];
  onRefresh?: () => void;
};

type EntityRow = Record<string, unknown> & {
  id: number;
};

/**
 * Formats a cell value for display
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (value instanceof Date) {
    return new Date(value).toLocaleString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Truncates a string to a maximum length
 */
function truncateString(str: string, maxLength: number = 50): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '...';
}

/**
 * Formats a date string for display
 */
function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

/**
 * ContentGroupCell component for rendering grouped content items
 */
function ContentGroupCell({
  items,
  expanded,
  onToggle,
}: {
  items: ContentRow[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const newestItem = items[0]; // Already sorted by createdAt desc

  if (!expanded) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm">
          {items.length} item{items.length !== 1 ? 's' : ''}
          {newestItem.type && ` • ${newestItem.type}`}
          {` • ${formatDate(newestItem.createdAt)}`}
        </span>
        <Button
          variant="link"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="h-6 px-2"
        >
          <ChevronRight className="h-3 w-3" />
          Expand
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
        <Button
          variant="link"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="h-6 px-2"
        >
          <ChevronDown className="h-3 w-3" />
          Collapse
        </Button>
      </div>
      <div className="space-y-3 pl-4 border-l-2 border-border">
        {items.map((item) => (
          <details key={item.id} className="group">
            <summary className="cursor-pointer text-sm font-medium hover:text-primary">
              <span className="text-muted-foreground">
                {item.type || '(no type)'}
              </span>
              {' • '}
              <span className="text-muted-foreground">
                {formatDate(item.createdAt)}
              </span>
              {' • '}
              <span className="text-muted-foreground">ID: {item.id}</span>
            </summary>
            <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
              {item.text.length > 200 ? (
                <>
                  <span>{item.text.slice(0, 200)}...</span>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-primary hover:underline">
                      Show more
                    </summary>
                    <div className="mt-1">{item.text.slice(200)}</div>
                  </details>
                </>
              ) : (
                item.text
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function DataTable({
  data,
  contentByEntityId,
  expandedIds,
  onToggleExpand,
  entityType,
}: {
  data: EntityRow[];
  contentByEntityId: Map<number, ContentRow[]>;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  entityType: 'museum' | 'room' | 'artifact';
}) {
  const columns = useMemo<ColumnDef<EntityRow>[]>(() => {
    const nameColumn: ColumnDef<EntityRow> = {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ getValue }) => {
        const value = getValue();
        const formatted = formatCellValue(value);
        return <div className="max-w-xs font-medium">{formatted}</div>;
      },
    };

    const knowledgeTextColumn: ColumnDef<EntityRow> = {
      accessorKey: 'knowledgeText',
      header: 'Knowledge Text',
      cell: ({ getValue }) => {
        const value = getValue();
        const formatted = formatCellValue(value);
        const truncated = truncateString(formatted, 100);
        const isTruncated = formatted.length > 100;

        return (
          <div className="max-w-md">
            <span
              className={cn(isTruncated && 'cursor-help')}
              title={isTruncated ? formatted : undefined}
            >
              {truncated}
            </span>
          </div>
        );
      },
    };

    const furtherReadingColumn: ColumnDef<EntityRow> = {
      accessorKey: 'furtherReading',
      header: 'Further Reading',
      cell: ({ getValue }) => {
        const value = getValue();
        if (Array.isArray(value) && value.length > 0) {
          return (
            <div className="max-w-md">
              <div className="space-y-1">
                {value.slice(0, 2).map((url, idx) => (
                  <div
                    key={idx}
                    className="text-sm text-muted-foreground truncate"
                  >
                    {String(url)}
                  </div>
                ))}
                {value.length > 2 && (
                  <div className="text-sm text-muted-foreground">
                    +{value.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
    };

    const updatedAtColumn: ColumnDef<EntityRow> = {
      accessorKey: 'updatedAt',
      header: 'Updated At',
      cell: ({ getValue }) => {
        const value = getValue();
        if (value instanceof Date) {
          return formatDate(value.toISOString());
        }
        if (typeof value === 'string') {
          return formatDate(value);
        }
        return <span className="text-muted-foreground">—</span>;
      },
    };

    const contentColumn: ColumnDef<EntityRow> = {
      id: 'content',
      header: 'Content',
      cell: ({ row }) => {
        const entityId = row.original.id;
        const content = contentByEntityId.get(entityId) || [];
        const expanded = expandedIds.has(entityId);

        return (
          <ContentGroupCell
            items={content}
            expanded={expanded}
            onToggle={() => onToggleExpand(entityId)}
          />
        );
      },
    };

    return [
      nameColumn,
      knowledgeTextColumn,
      furtherReadingColumn,
      updatedAtColumn,
      contentColumn,
    ];
  }, [contentByEntityId, expandedIds, onToggleExpand]);

  const table = useReactTable({
    data: data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function ContentTabsClient({
  museums,
  rooms,
  artifacts,
  content,
  onRefresh,
}: ContentTabsClientProps) {
  const [activeTab, setActiveTab] = useState('museums');
  const [expandedMuseumIds, setExpandedMuseumIds] = useState<Set<number>>(
    new Set()
  );
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<number>>(
    new Set()
  );
  const [expandedArtifactIds, setExpandedArtifactIds] = useState<Set<number>>(
    new Set()
  );

  // Build lookup maps for grouping content
  const contentByMuseumId = useMemo(() => {
    const map = new Map<number, ContentRow[]>();
    content.forEach((item) => {
      if (item.museumId !== null) {
        const existing = map.get(item.museumId) || [];
        existing.push(item);
        map.set(item.museumId, existing);
      }
    });
    // Sort each group by createdAt desc (defensive, already sorted from API)
    map.forEach((items) => {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    return map;
  }, [content]);

  const contentByRoomId = useMemo(() => {
    const map = new Map<number, ContentRow[]>();
    content.forEach((item) => {
      if (item.roomId !== null) {
        const existing = map.get(item.roomId) || [];
        existing.push(item);
        map.set(item.roomId, existing);
      }
    });
    map.forEach((items) => {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    return map;
  }, [content]);

  const contentByArtifactId = useMemo(() => {
    const map = new Map<number, ContentRow[]>();
    content.forEach((item) => {
      if (item.artifactId !== null) {
        const existing = map.get(item.artifactId) || [];
        existing.push(item);
        map.set(item.artifactId, existing);
      }
    });
    map.forEach((items) => {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    return map;
  }, [content]);

  const handleRefresh = () => {
    // Trigger parent's refresh function if provided
    if (onRefresh) {
      onRefresh();
    }
  };

  const getCurrentData = () => {
    switch (activeTab) {
      case 'museums':
        return museums as EntityRow[];
      case 'rooms':
        return rooms as EntityRow[];
      case 'artifacts':
        return artifacts as EntityRow[];
      default:
        return [];
    }
  };

  const getCurrentCount = () => {
    return getCurrentData().length;
  };

  const getCurrentContentMap = () => {
    switch (activeTab) {
      case 'museums':
        return contentByMuseumId;
      case 'rooms':
        return contentByRoomId;
      case 'artifacts':
        return contentByArtifactId;
      default:
        return new Map<number, ContentRow[]>();
    }
  };

  const getCurrentExpandedIds = () => {
    switch (activeTab) {
      case 'museums':
        return expandedMuseumIds;
      case 'rooms':
        return expandedRoomIds;
      case 'artifacts':
        return expandedArtifactIds;
      default:
        return new Set<number>();
    }
  };

  const getCurrentSetExpandedIds = () => {
    switch (activeTab) {
      case 'museums':
        return setExpandedMuseumIds;
      case 'rooms':
        return setExpandedRoomIds;
      case 'artifacts':
        return setExpandedArtifactIds;
      default:
        return () => {};
    }
  };

  const handleToggleExpand = (id: number) => {
    const setExpanded = getCurrentSetExpandedIds();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const contentMap = getCurrentContentMap();
    const setExpanded = getCurrentSetExpandedIds();
    const idsWithContent = Array.from(contentMap.keys());
    setExpanded(new Set(idsWithContent));
  };

  const handleCollapseAll = () => {
    const setExpanded = getCurrentSetExpandedIds();
    setExpanded(new Set());
  };

  const currentData = getCurrentData();
  const currentContentMap = getCurrentContentMap();
  const currentExpandedIds = getCurrentExpandedIds();
  const entityType =
    activeTab === 'museums'
      ? 'museum'
      : activeTab === 'rooms'
        ? 'room'
        : 'artifact';

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="museums">Museums</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {getCurrentCount()} {activeTab}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <TabsContent value="museums" className="mt-4">
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExpandAll}
                className="flex items-center gap-2"
              >
                <ChevronDown className="h-4 w-4" />
                Expand all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCollapseAll}
                className="flex items-center gap-2"
              >
                <ChevronRight className="h-4 w-4" />
                Collapse all
              </Button>
            </div>
          </div>
          <DataTable
            data={currentData}
            contentByEntityId={currentContentMap}
            expandedIds={currentExpandedIds}
            onToggleExpand={handleToggleExpand}
            entityType={entityType}
          />
        </TabsContent>

        <TabsContent value="rooms" className="mt-4">
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExpandAll}
                className="flex items-center gap-2"
              >
                <ChevronDown className="h-4 w-4" />
                Expand all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCollapseAll}
                className="flex items-center gap-2"
              >
                <ChevronRight className="h-4 w-4" />
                Collapse all
              </Button>
            </div>
          </div>
          <DataTable
            data={currentData}
            contentByEntityId={currentContentMap}
            expandedIds={currentExpandedIds}
            onToggleExpand={handleToggleExpand}
            entityType={entityType}
          />
        </TabsContent>

        <TabsContent value="artifacts" className="mt-4">
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExpandAll}
                className="flex items-center gap-2"
              >
                <ChevronDown className="h-4 w-4" />
                Expand all
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCollapseAll}
                className="flex items-center gap-2"
              >
                <ChevronRight className="h-4 w-4" />
                Collapse all
              </Button>
            </div>
          </div>
          <DataTable
            data={currentData}
            contentByEntityId={currentContentMap}
            expandedIds={currentExpandedIds}
            onToggleExpand={handleToggleExpand}
            entityType={entityType}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
