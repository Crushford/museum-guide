'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLayout, SectionCard } from '@/components/shared';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/signup');
    }
  }, [loading, router, user]);

  return (
    <PageLayout title="Login" narrow>
      <SectionCard
        title="Sign in"
        subtitle="Use your Google account to continue."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Free users can browse existing pages. Premium and admin users can
            create museums and artifacts.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void signIn()} disabled={loading}>
              Sign in with Google
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/">Back to homepage</Link>
            </Button>
          </div>
        </div>
      </SectionCard>
    </PageLayout>
  );
}
