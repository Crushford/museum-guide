'use client';

import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme-preference';

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'system';
}

export function useTheme() {
  const preference = useSyncExternalStore(
    subscribeToStorage,
    getPreference,
    () => 'system' as ThemePreference
  );

  const setPreference = (next: ThemePreference) => {
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
    }
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  };

  return { preference, setPreference };
}
