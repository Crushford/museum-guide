'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageLayout, SectionCard } from '@/components/shared';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type UserRole = 'free' | 'premium' | 'admin';

type AdminUserRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  canCreate: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  upgradedAt: string | null;
  upgradeCode: string | null;
  promoUsage: Array<{
    code: string;
    uses: number;
    lastRedeemedAt: string;
  }>;
};

function formatDate(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

export default function AdminUsersPage() {
  const authedApi = useAuthedApi();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.role !== b.role) {
          const order: Record<UserRole, number> = {
            admin: 0,
            premium: 1,
            free: 2,
          };
          return order[a.role] - order[b.role];
        }
        return (a.email ?? '').localeCompare(b.email ?? '');
      }),
    [rows]
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usersResponse = await authedApi.get<AdminUserRow[]>('/admin/users');
      setRows(usersResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load users.'
      );
    } finally {
      setLoading(false);
    }
  }, [authedApi]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const updateRole = async (uid: string, role: UserRole) => {
    const previous = rows;
    setRows((current) =>
      current.map((entry) => (entry.uid === uid ? { ...entry, role } : entry))
    );
    setSavingUid(uid);
    setError(null);
    try {
      await authedApi.mutate(`/admin/users/${encodeURIComponent(uid)}/role`, {
        method: 'PATCH',
        body: { role },
      });
      await loadUsers();
    } catch (saveError) {
      setRows(previous);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to update role.'
      );
    } finally {
      setSavingUid(null);
    }
  };

  if (loading) {
    return (
      <PageLayout title="Admin Users">
        <SectionCard title="">
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        </SectionCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Admin Users">
      <SectionCard
        title="User Roles"
        subtitle="Manage free, premium, and admin access."
      >
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>UID</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Upgrade Code</TableHead>
                <TableHead>Promo Usage</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.uid}>
                  <TableCell>{row.email ?? 'n/a'}</TableCell>
                  <TableCell>{row.displayName ?? 'n/a'}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">
                    {row.uid}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.role}
                      onValueChange={(value) =>
                        void updateRole(row.uid, value as UserRole)
                      }
                      disabled={savingUid === row.uid}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{row.upgradeCode ?? 'n/a'}</TableCell>
                  <TableCell className="max-w-[280px]">
                    {row.promoUsage.length === 0 ? (
                      'n/a'
                    ) : (
                      <div className="space-y-1 text-xs">
                        {row.promoUsage.slice(0, 3).map((usage) => (
                          <p key={`${row.uid}-${usage.code}`}>
                            <span className="font-mono">{usage.code}</span>:{' '}
                            {usage.uses}x
                          </p>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </PageLayout>
  );
}
