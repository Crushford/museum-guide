'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { API_URL } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';

const HEALTH_PATH = '/health';
const RETRY_DELAY_MS = 1000;
const INITIAL_CHECK_TIMEOUT_MS = 1600;
const RETRY_CHECK_TIMEOUT_MS = 1500;
const TIP_ROTATE_MS = 6000;
const SESSION_KEY = 'api-wakeup-checked-v1';

type ApiWakeupGateProps = {
  children: ReactNode;
};

const TIPS = [
  "Thanks so much for using Museum Guide. You're one of our earliest users.",
  'We would love your feedback. Please email us at museumguideio@gmail.com.',
  'Want a free premium promo code? Join the waiting list and we will reply quickly.',
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isApiHealthy(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${HEALTH_PATH}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function ApiWakeupGate({ children }: ApiWakeupGateProps) {
  const pathname = usePathname();
  const [showModal, setShowModal] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (pathname !== '/') return;
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(SESSION_KEY) === '1') return;

    let cancelled = false;
    let startedAt = Date.now();
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;
    let tipTimer: ReturnType<typeof setInterval> | null = null;

    const clearTimers = () => {
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      if (tipTimer) {
        clearInterval(tipTimer);
        tipTimer = null;
      }
    };

    const startModalTimers = () => {
      startedAt = Date.now();
      setElapsedSeconds(0);
      setTipIndex(0);
      elapsedTimer = setInterval(() => {
        if (!cancelled) {
          setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }
      }, 1000);

      tipTimer = setInterval(() => {
        if (!cancelled) {
          setTipIndex((current) => (current + 1) % TIPS.length);
        }
      }, TIP_ROTATE_MS);
    };

    const warmApiUntilHealthy = async () => {
      while (!cancelled) {
        const healthy = await isApiHealthy(RETRY_CHECK_TIMEOUT_MS);
        if (healthy) {
          window.sessionStorage.setItem(SESSION_KEY, '1');
          clearTimers();
          setShowModal(false);
          return;
        }
        await delay(RETRY_DELAY_MS);
      }
    };

    const checkOnFirstArrival = async () => {
      const initiallyHealthy = await isApiHealthy(INITIAL_CHECK_TIMEOUT_MS);
      if (cancelled) return;
      if (initiallyHealthy) {
        window.sessionStorage.setItem(SESSION_KEY, '1');
        return;
      }

      setShowModal(true);
      startModalTimers();
      await warmApiUntilHealthy();
    };

    void checkOnFirstArrival();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [pathname]);

  return (
    <>
      {children}
      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-xl rounded-xl border border-line-subtle bg-canvas px-6 py-7 shadow-sm">
            <div className="flex items-center gap-3">
              <Spinner size="lg" className="text-fg" />
              <div>
                <h2 className="text-lg font-semibold text-fg">
                  Waking the API
                </h2>
                <p className="text-sm text-fg-subtle">
                  This is a low-cost prototype. The backend sleeps when idle and
                  may take about a minute to start.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-line-subtle bg-elevated px-4 py-3">
              <p className="text-sm text-fg">{TIPS[tipIndex]}</p>
              {tipIndex === 2 ? (
                <p className="mt-2 text-sm">
                  <Link
                    href="/waitlist"
                    className="underline underline-offset-2"
                  >
                    Open the waiting list
                  </Link>
                </p>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-fg-subtle">
              Checking health every {Math.floor(RETRY_DELAY_MS / 1000)}s.
              Elapsed: {elapsedSeconds}s.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
