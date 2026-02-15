'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { PromptTemplateBox } from '@/components/shared';
import { generateIntroductionTemplate } from '../_lib/templates';
import { API_URL } from '@/lib/api';
import { useAuthedApi } from '@/lib/useAuthedApi';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type {
  MuseumResponse,
  RoomResponse,
  ArtifactResponse,
} from '@repo/types';
import type { ContentRow } from '@/lib/types';

type ContentTabsClientProps = {
  museums: MuseumResponse[];
  rooms: RoomResponse[];
  artifacts: ArtifactResponse[];
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
  onGenerateAudio,
  generatingAudioContentIds,
}: {
  items: ContentRow[];
  expanded: boolean;
  onToggle: () => void;
  onGenerateAudio?: (contentId: number) => Promise<void>;
  generatingAudioContentIds?: Set<number>;
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
        {items.map((item) => {
          const isGeneratingAudio =
            generatingAudioContentIds?.has(item.id) || false;
          const hasAudio = !!item.audioUrl;

          return (
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
                {hasAudio && (
                  <>
                    {' • '}
                    <span className="text-accent">🎵 Audio</span>
                  </>
                )}
              </summary>
              <div className="mt-2 space-y-2">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
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
                {onGenerateAudio && (
                  <div className="flex items-center gap-2">
                    {hasAudio && (
                      <audio
                        controls
                        src={`${API_URL}${item.audioUrl}`}
                        className="h-8"
                      >
                        Your browser does not support the audio element.
                      </audio>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateAudio(item.id);
                      }}
                      disabled={isGeneratingAudio}
                    >
                      {isGeneratingAudio ? (
                        <>
                          <Spinner size="xs" className="mr-2" />
                          Generating...
                        </>
                      ) : hasAudio ? (
                        'Regenerate Audio'
                      ) : (
                        'Generate Audio'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </details>
          );
        })}
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
  museums,
  rooms,
  artifacts,
  onViewTemplate,
  onGenerateContent,
  onGenerateAudio,
  onGenerateAudioForContent,
  generatingArtifactIds,
  generatingAudioArtifactIds,
  generatingAudioContentIds,
}: {
  data: EntityRow[];
  contentByEntityId: Map<number, ContentRow[]>;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  entityType: 'museum' | 'room' | 'artifact';
  museums: MuseumResponse[];
  rooms: RoomResponse[];
  artifacts: ArtifactResponse[];
  onViewTemplate: (template: string, title: string, artifactId: number) => void;
  onGenerateContent: (artifactId: number) => Promise<void>;
  onGenerateAudio: (artifactId: number) => Promise<void>;
  onGenerateAudioForContent: (contentId: number) => Promise<void>;
  generatingArtifactIds: Set<number>;
  generatingAudioArtifactIds: Set<number>;
  generatingAudioContentIds: Set<number>;
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

    const museumNameColumn: ColumnDef<EntityRow> = {
      id: 'museumName',
      header: 'Museum',
      cell: ({ row }) => {
        if (entityType !== 'artifact') {
          return <span className="text-muted-foreground">—</span>;
        }
        const artifactId = row.original.id;
        const artifact = artifacts.find((a) => a.id === artifactId);
        if (!artifact) return <span className="text-muted-foreground">—</span>;

        // Museum name should be populated from server
        const museumName = artifact.museumName;

        return (
          <div className="max-w-xs">
            {museumName || <span className="text-muted-foreground">—</span>}
          </div>
        );
      },
    };

    const roomNameColumn: ColumnDef<EntityRow> = {
      id: 'roomName',
      header: 'Room',
      cell: ({ row }) => {
        if (entityType !== 'artifact') {
          return <span className="text-muted-foreground">—</span>;
        }
        const artifactId = row.original.id;
        const artifact = artifacts.find((a) => a.id === artifactId);
        if (!artifact) return <span className="text-muted-foreground">—</span>;

        // Find the room and parent room
        const room = rooms.find((r) => r.id === artifact.roomId);
        if (!room) return <span className="text-muted-foreground">—</span>;

        const parentRoom = artifact.parentRoomName
          ? rooms.find((r) => r.name === artifact.parentRoomName)
          : room.parentRoomId
            ? rooms.find((r) => r.id === room.parentRoomId)
            : undefined;

        // Format as "parent room / child room" or just "room" if no parent
        const roomDisplay = parentRoom
          ? `${parentRoom.name} / ${room.name}`
          : room.name;

        return (
          <div className="max-w-xs">
            {roomDisplay || <span className="text-muted-foreground">—</span>}
          </div>
        );
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
            onGenerateAudio={onGenerateAudioForContent}
            generatingAudioContentIds={generatingAudioContentIds}
          />
        );
      },
    };

    const actionsColumn: ColumnDef<EntityRow> = {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        if (entityType !== 'artifact') {
          return <span className="text-muted-foreground">—</span>;
        }

        const artifactId = row.original.id;
        const artifact = artifacts.find((a) => a.id === artifactId);
        if (!artifact) return null;

        const room = rooms.find((r) => r.id === artifact.roomId);
        const museum = museums.find(
          (m) => m.id === artifact.museumId || m.id === room?.museumId
        );

        const handleGenerateContent = async () => {
          await onGenerateContent(artifactId);
        };

        const handleGenerateAudio = async () => {
          await onGenerateAudio(artifactId);
        };

        const isGenerating = generatingArtifactIds.has(artifactId);
        const isGeneratingAudio = generatingAudioArtifactIds.has(artifactId);

        // Check if content exists for this artifact
        const artifactContent = contentByEntityId.get(artifactId) || [];
        const hasContent = artifactContent.length > 0;

        const handleViewTemplate = () => {
          // All data is already available in the table
          const parentRoom = artifact.parentRoomName
            ? rooms.find((r) => r.name === artifact.parentRoomName)
            : room
              ? rooms.find((r) => r.id === room.parentRoomId)
              : undefined;
          const template = generateIntroductionTemplate(
            artifact,
            room,
            museum,
            parentRoom
          );
          onViewTemplate(template, `Template for ${artifact.name}`, artifactId);
        };

        return (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleViewTemplate();
              }}
            >
              View Template
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleGenerateContent();
              }}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2" />
                  Generating...
                </>
              ) : (
                'Generate Content'
              )}
            </Button>
            {hasContent && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateAudio();
                }}
                disabled={isGeneratingAudio}
              >
                {isGeneratingAudio ? (
                  <>
                    <Spinner className="mr-2" />
                    Generating...
                  </>
                ) : (
                  'Generate Audio'
                )}
              </Button>
            )}
          </div>
        );
      },
    };

    const baseColumns: ColumnDef<EntityRow>[] = [nameColumn];

    // Add museum and room columns only for artifacts
    if (entityType === 'artifact') {
      baseColumns.push(museumNameColumn, roomNameColumn);
    }

    return [
      ...baseColumns,
      knowledgeTextColumn,
      furtherReadingColumn,
      updatedAtColumn,
      contentColumn,
      actionsColumn,
    ];
  }, [
    contentByEntityId,
    expandedIds,
    onToggleExpand,
    entityType,
    museums,
    rooms,
    artifacts,
    onViewTemplate,
    onGenerateContent,
    onGenerateAudio,
    onGenerateAudioForContent,
    generatingArtifactIds,
    generatingAudioArtifactIds,
    generatingAudioContentIds,
  ]);

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
  const authedApi = useAuthedApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || 'museums';
  const [activeTab, setActiveTab] = useState(tabParam);

  // Sync tab state with URL
  useEffect(() => {
    const currentTab = searchParams.get('tab') || 'museums';
    if (currentTab !== activeTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'museums') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    router.push(`/admin/content?${params.toString()}`);
  };
  const [selectedTemplateArtifactId, setSelectedTemplateArtifactId] = useState<
    number | null
  >(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedTemplateTitle, setSelectedTemplateTitle] =
    useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedMuseumIds, setExpandedMuseumIds] = useState<Set<number>>(
    new Set()
  );
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<number>>(
    new Set()
  );
  const [expandedArtifactIds, setExpandedArtifactIds] = useState<Set<number>>(
    new Set()
  );
  const [generatingArtifactIds, setGeneratingArtifactIds] = useState<
    Set<number>
  >(new Set());
  const [generatingAudioArtifactIds, setGeneratingAudioArtifactIds] = useState<
    Set<number>
  >(new Set());
  const [generatingAudioContentIds, setGeneratingAudioContentIds] = useState<
    Set<number>
  >(new Set());

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

  const handleViewTemplate = (
    template: string,
    title: string,
    artifactId: number
  ) => {
    setSelectedTemplate(template);
    setSelectedTemplateTitle(title);
    setSelectedTemplateArtifactId(artifactId);
  };

  const handleGenerateContent = useCallback(
    async (artifactId: number) => {
      try {
        setGeneratingArtifactIds((prev) => new Set(prev).add(artifactId));
        await authedApi.post(`/generate-content/artefact/${artifactId}`);
        // Refresh content after successful generation
        onRefresh?.();
      } catch (error) {
        console.error('Error generating content:', error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to generate content. Please try again.';
        setErrorMessage(errorMsg);
      } finally {
        setGeneratingArtifactIds((prev) => {
          const next = new Set(prev);
          next.delete(artifactId);
          return next;
        });
      }
    },
    [onRefresh, authedApi]
  );

  const handleGenerateAudio = useCallback(
    async (artifactId: number) => {
      try {
        setGeneratingAudioArtifactIds((prev) => new Set(prev).add(artifactId));
        await authedApi.post(`/generate-audio/artefact/${artifactId}`);
        // Refresh content after successful generation
        onRefresh?.();
      } catch (error) {
        console.error('Error generating audio:', error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to generate audio. Please try again.';
        setErrorMessage(errorMsg);
      } finally {
        setGeneratingAudioArtifactIds((prev) => {
          const next = new Set(prev);
          next.delete(artifactId);
          return next;
        });
      }
    },
    [onRefresh, authedApi]
  );

  const handleGenerateAudioForContent = useCallback(
    async (contentId: number) => {
      try {
        setGeneratingAudioContentIds((prev) => new Set(prev).add(contentId));
        await authedApi.post(`/generate-audio/content/${contentId}`);
        // Refresh content after successful generation
        onRefresh?.();
      } catch (error) {
        console.error('Error generating audio for content:', error);
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to generate audio. Please try again.';
        setErrorMessage(errorMsg);
      } finally {
        setGeneratingAudioContentIds((prev) => {
          const next = new Set(prev);
          next.delete(contentId);
          return next;
        });
      }
    },
    [onRefresh, authedApi]
  );

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
      <Tabs value={activeTab} onValueChange={handleTabChange}>
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
            museums={museums}
            rooms={rooms}
            artifacts={artifacts}
            onViewTemplate={handleViewTemplate}
            onGenerateContent={handleGenerateContent}
            onGenerateAudio={handleGenerateAudio}
            onGenerateAudioForContent={handleGenerateAudioForContent}
            generatingArtifactIds={generatingArtifactIds}
            generatingAudioArtifactIds={generatingAudioArtifactIds}
            generatingAudioContentIds={generatingAudioContentIds}
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
            museums={museums}
            rooms={rooms}
            artifacts={artifacts}
            onViewTemplate={handleViewTemplate}
            onGenerateContent={handleGenerateContent}
            onGenerateAudio={handleGenerateAudio}
            onGenerateAudioForContent={handleGenerateAudioForContent}
            generatingArtifactIds={generatingArtifactIds}
            generatingAudioArtifactIds={generatingAudioArtifactIds}
            generatingAudioContentIds={generatingAudioContentIds}
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
            museums={museums}
            rooms={rooms}
            artifacts={artifacts}
            onViewTemplate={handleViewTemplate}
            onGenerateContent={handleGenerateContent}
            onGenerateAudio={handleGenerateAudio}
            onGenerateAudioForContent={handleGenerateAudioForContent}
            generatingArtifactIds={generatingArtifactIds}
            generatingAudioArtifactIds={generatingAudioArtifactIds}
            generatingAudioContentIds={generatingAudioContentIds}
          />
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!selectedTemplateArtifactId && !!selectedTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTemplateArtifactId(null);
            setSelectedTemplate('');
            setSelectedTemplateTitle('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplateTitle}</DialogTitle>
          </DialogHeader>
          <PromptTemplateBox
            title=""
            template={selectedTemplate}
            helperText="Click Copy to copy this template to your clipboard."
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!errorMessage}
        onOpenChange={(open) => {
          if (!open) {
            setErrorMessage(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Error Generating Content
            </DialogTitle>
            <DialogDescription>
              An error occurred while generating content. See details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              An error occurred while generating content:
            </p>
            <div className="rounded-md bg-muted p-4">
              <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                {errorMessage}
              </pre>
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-2">Common solutions:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  Make sure the Prisma client has been regenerated after schema
                  changes
                </li>
                <li>
                  Check that the database schema matches the Prisma schema
                </li>
                <li>Verify that GEMINI_API_KEY is configured correctly</li>
                <li>Check the server logs for more details</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
