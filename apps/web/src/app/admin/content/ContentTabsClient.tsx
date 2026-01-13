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
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type ContentTabsClientProps = {
  museums: unknown[];
  rooms: unknown[];
  artifacts: unknown[];
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

function DataTable({ data }: { data: unknown[] }) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (data.length === 0) {
      return [];
    }

    const firstRow = data[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);

    return keys.map((key) => ({
      accessorKey: key,
      header:
        key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
      cell: ({ getValue }) => {
        const value = getValue();
        const formatted = formatCellValue(value);
        const truncated = truncateString(formatted, 50);
        const isTruncated = formatted.length > 50;

        return (
          <div className="max-w-xs">
            <span
              className={cn(isTruncated && 'cursor-help')}
              title={isTruncated ? formatted : undefined}
            >
              {truncated}
            </span>
          </div>
        );
      },
    }));
  }, [data]);

  const table = useReactTable({
    data: data as Record<string, unknown>[],
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
}: ContentTabsClientProps) {
  const [activeTab, setActiveTab] = useState('museums');

  const handleRefresh = () => {
    // Reload the page to refetch data server-side
    window.location.reload();
  };

  const getCurrentData = () => {
    switch (activeTab) {
      case 'museums':
        return museums;
      case 'rooms':
        return rooms;
      case 'artifacts':
        return artifacts;
      default:
        return [];
    }
  };

  const getCurrentCount = () => {
    return getCurrentData().length;
  };

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
              variant="outline"
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
          <DataTable data={museums} />
        </TabsContent>

        <TabsContent value="rooms" className="mt-4">
          <DataTable data={rooms} />
        </TabsContent>

        <TabsContent value="artifacts" className="mt-4">
          <DataTable data={artifacts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
