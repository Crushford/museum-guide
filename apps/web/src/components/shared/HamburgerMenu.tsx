'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X, Sun, Moon, Monitor, Activity, LogOut } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import type { ThemePreference } from '@/hooks/useTheme';

const themeOptions: {
  value: ThemePreference;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'system',
    label: 'System',
    icon: <Monitor className="h-3.5 w-3.5" />,
  },
  { value: 'light', label: 'Light', icon: <Sun className="h-3.5 w-3.5" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-3.5 w-3.5" /> },
];

export function HamburgerMenu() {
  const { user, loading, signIn, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (loading) {
    return <div className="h-8 w-8" />;
  }

  if (!user) {
    return (
      <Button variant="secondary" size="sm" onClick={() => void signIn()}>
        Sign in with Google
      </Button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-line bg-overlay p-3 shadow-lg">
          {/* User */}
          <div className="mb-3 border-b border-line-subtle pb-3">
            <p className="text-xs text-fg-subtle">Signed in as</p>
            <p className="truncate text-sm font-medium">{user.email}</p>
          </div>

          {/* Theme */}
          <div className="mb-3 border-b border-line-subtle pb-3">
            <p className="mb-2 text-xs text-fg-subtle">Theme</p>
            <div className="flex gap-1.5">
              {themeOptions.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => setPreference(value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                    preference === value
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line text-fg-subtle hover:border-line hover:bg-surface hover:text-fg'
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Activity */}
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
          >
            <Activity className="h-4 w-4" />
            Activity
          </Link>

          {/* Log out */}
          <button
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
