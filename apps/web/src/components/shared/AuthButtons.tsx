'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <Button variant="secondary" size="sm" disabled>
        Loading...
      </Button>
    );
  }

  if (!session?.user?.id) {
    return (
      <Button size="sm" onClick={() => void signIn('google')}>
        Sign In
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {session.user.name || session.user.email}
      </span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void signOut({ callbackUrl: '/' })}
      >
        Sign Out
      </Button>
    </div>
  );
}
