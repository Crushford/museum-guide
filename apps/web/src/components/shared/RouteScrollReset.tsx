'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function RouteScrollResetInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locationKey = `${pathname ?? ''}?${searchParams.toString()}`;
  const previousLocationKeyRef = useRef<string | null>(null);
  const previousPathnameRef = useRef<string | null>(null);
  const preserveNextScrollRef = useRef(false);

  useEffect(() => {
    function handlePopState() {
      // Let the browser restore scroll position for back/forward navigation.
      preserveNextScrollRef.current = true;
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!pathname) return;

    const previousLocationKey = previousLocationKeyRef.current;
    const previousPathname = previousPathnameRef.current;

    previousLocationKeyRef.current = locationKey;
    previousPathnameRef.current = pathname;

    if (previousLocationKey === null || previousLocationKey === locationKey) {
      return;
    }

    if (preserveNextScrollRef.current) {
      preserveNextScrollRef.current = false;
      return;
    }

    if (previousPathname !== pathname) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [locationKey, pathname]);

  return null;
}

export function RouteScrollReset() {
  return (
    <Suspense fallback={null}>
      <RouteScrollResetInner />
    </Suspense>
  );
}
