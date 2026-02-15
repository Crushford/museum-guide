'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { AdminNav } from '@/components/shared/AdminNav';
import { PageLayout } from '@/components/shared';
import { SectionCard } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin, signIn, signOut, refreshAdminClaims } =
    useAuth();

  useEffect(() => {
    if (loading || !user || isAdmin) {
      return;
    }

    void refreshAdminClaims().catch(() => {});
  }, [loading, user, isAdmin, refreshAdminClaims]);

  if (loading) {
    return (
      <>
        <AdminNav />
        <PageLayout title="Admin">
          <SectionCard title="">
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" className="text-muted-foreground" />
            </div>
          </SectionCard>
        </PageLayout>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AdminNav />
        <PageLayout title="Admin">
          <SectionCard title="">
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <p className="text-muted-foreground">
                Sign in to access the admin dashboard.
              </p>
              <Button onClick={signIn}>Sign in with Google</Button>
            </div>
          </SectionCard>
        </PageLayout>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <AdminNav />
        <PageLayout title="Admin">
          <SectionCard title="">
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <p className="text-muted-foreground">
                Access denied. You do not have admin privileges.
              </p>
              <p className="text-sm text-muted-foreground">
                Signed in as {user.email}
              </p>
              <Button
                variant="default"
                onClick={() => void refreshAdminClaims().catch(() => {})}
              >
                Refresh permissions
              </Button>
              <Button variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </SectionCard>
        </PageLayout>
      </>
    );
  }

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
