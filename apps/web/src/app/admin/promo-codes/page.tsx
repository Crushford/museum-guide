'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageLayout, SectionCard } from '@/components/shared';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type PromoCodeRow = {
  id: number;
  code: string;
  isActive: boolean;
  maxRedemptions: number;
  usedRedemptions: number;
  remainingRedemptions: number;
  redemptions: Array<{
    userUid: string;
    email: string | null;
    displayName: string | null;
    redeemedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

export default function AdminPromoCodesPage() {
  const authedApi = useAuthedApi();
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLimit, setNewLimit] = useState('15');

  const loadPromoCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response =
        await authedApi.get<PromoCodeRow[]>('/admin/promo-codes');
      setRows(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load promo codes.'
      );
    } finally {
      setLoading(false);
    }
  }, [authedApi]);

  useEffect(() => {
    void loadPromoCodes();
  }, [loadPromoCodes]);

  const createPromoCode = async () => {
    const code = newCode.trim().toLowerCase();
    const maxRedemptions = Number(newLimit);
    if (!code) {
      setError('Promo code cannot be empty.');
      return;
    }
    if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
      setError('Max redemptions must be a positive whole number.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await authedApi.mutate('/admin/promo-codes', {
        method: 'POST',
        body: {
          code,
          maxRedemptions,
          isActive: true,
        },
      });
      setNewCode('');
      await loadPromoCodes();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Failed to create promo code.'
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <PageLayout title="Admin Promo Codes">
        <SectionCard title="">
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        </SectionCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Admin Promo Codes">
      <SectionCard
        title="Promo Code Management"
        subtitle="Create promo codes and monitor remaining redemption capacity."
      >
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}

          <div className="rounded-md border border-line p-3">
            <p className="mb-2 text-sm font-medium">Create promo code</p>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={newCode}
                onChange={(event) => setNewCode(event.target.value)}
                placeholder="Code (e.g. beta-tester-amy)"
                disabled={creating}
              />
              <Input
                value={newLimit}
                onChange={(event) => setNewLimit(event.target.value)}
                placeholder="Max redemptions"
                inputMode="numeric"
                disabled={creating}
                className="md:w-44"
              />
              <Button
                onClick={() => void createPromoCode()}
                disabled={creating}
              >
                Create
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Recent Redeemer</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {row.code}
                  </TableCell>
                  <TableCell>{row.isActive ? 'Active' : 'Disabled'}</TableCell>
                  <TableCell>
                    {row.usedRedemptions} / {row.maxRedemptions}
                  </TableCell>
                  <TableCell>{row.remainingRedemptions}</TableCell>
                  <TableCell>
                    {row.redemptions.length > 0
                      ? (row.redemptions[0].email ?? row.redemptions[0].userUid)
                      : 'n/a'}
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No promo codes yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </PageLayout>
  );
}
