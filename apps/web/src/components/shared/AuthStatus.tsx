'use client';

import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/button';

export function AuthStatus() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) {
    return (
      <span className="text-sm text-muted-foreground">Checking session...</span>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void signIn()}>
          Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted-foreground sm:inline">
        {user.email}
      </span>
      <Button variant="secondary" size="sm" asChild>
        <Link href="/account">Account</Link>
      </Button>
      <Button variant="secondary" size="sm" onClick={() => void signOut()}>
        Log out
      </Button>
    </div>
  );
}
