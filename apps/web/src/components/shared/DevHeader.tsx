'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import type { OcrProviderName } from '@repo/types';
import type { TtsProviderName } from '@/hooks/usePreferredTTSProvider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/components/providers/AuthProvider';

type SpendRow = {
  provider: string;
  totalEur: number;
};

type TierUsage = {
  used: number;
  limit: number;
};

type DailyUsage = {
  premium: TierUsage;
  mini: TierUsage;
};

type ApiCallsDaily = {
  totalCalls: number;
  services: { service: string; count: number; avgDurationMs: number }[];
};

function subscribeToStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function useLocalStorageValue(key: string, fallback: string): string {
  return useSyncExternalStore(
    subscribeToStorage,
    () => localStorage.getItem(key) ?? fallback,
    () => fallback
  );
}

function setLocalStorage(key: string, value: string | null) {
  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
  window.dispatchEvent(new StorageEvent('storage', { key }));
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = Math.min((used / limit) * 100, 100);
  const remaining = Math.max(limit - used, 0);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
  const hoverColor = pct > 90 ? '#f87171' : pct > 70 ? '#fbbf24' : '#4ade80';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group flex items-center gap-1.5 cursor-default">
          <span className="text-fg-subtle whitespace-nowrap">{label}:</span>
          <div className="relative h-2.5 w-20 rounded-full bg-raised overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
              style={{
                width: `${pct}%`,
                backgroundColor: barColor,
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor = hoverColor;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = barColor;
              }}
            />
          </div>
          <span className="text-fg-subtle whitespace-nowrap">
            {formatTokens(remaining)} left
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-mono text-xs">
          {used.toLocaleString()} / {limit.toLocaleString()} tokens (
          {pct.toFixed(1)}%)
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function DevHeader() {
  const { user, isAdmin, getIdToken } = useAuth();
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({
    premium: { used: 0, limit: 250_000 },
    mini: { used: 0, limit: 2_500_000 },
  });
  const [apiCalls, setApiCalls] = useState<ApiCallsDaily | null>(null);

  const providerRaw = useLocalStorageValue('preferred-llm-provider', 'google');
  const provider: 'google' | 'openai' =
    providerRaw === 'openai' ? 'openai' : 'google';
  const ocrProviderRaw = useLocalStorageValue(
    'preferred-ocr-provider',
    'ocr-space'
  );
  const ocrProvider: OcrProviderName =
    ocrProviderRaw === 'google-vision' ? 'google-vision' : 'ocr-space';
  const ttsProviderRaw = useLocalStorageValue(
    'preferred-tts-provider',
    'inworld'
  );
  const ttsProvider: TtsProviderName =
    ttsProviderRaw === 'google-tts' ? 'google-tts' : 'inworld';
  const hidden = useLocalStorageValue('dev-header-hidden', '0') === '1';

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (!user || !isAdmin) {
        if (!cancelled) {
          setSpend([]);
          setDailyUsage({
            premium: { used: 0, limit: 250_000 },
            mini: { used: 0, limit: 2_500_000 },
          });
          setApiCalls(null);
        }
        return;
      }

      try {
        const token = await getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const [spendRes, usageRes, callsRes] = await Promise.all([
          fetch(`${API_URL}/admin/llm-usage/monthly`, { headers }),
          fetch(`${API_URL}/admin/openai-usage/daily`, { headers }),
          fetch(`${API_URL}/admin/api-calls/daily`, { headers }),
        ]);

        const [spendData, usageData, callsData] = await Promise.all([
          spendRes.ok ? spendRes.json() : null,
          usageRes.ok ? usageRes.json() : null,
          callsRes.ok ? callsRes.json() : null,
        ]);

        if (!cancelled && spendData?.spend) setSpend(spendData.spend);
        if (!cancelled && usageData?.premium && usageData?.mini) {
          setDailyUsage(usageData);
        }
        if (!cancelled && callsData?.totalCalls !== undefined) {
          setApiCalls(callsData);
        }
      } catch {
        // Ignore DevHeader polling errors
      }
    };

    refresh();
    const intervalId = window.setInterval(refresh, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user, isAdmin, getIdToken]);

  const totalEur = spend.reduce((sum, r) => sum + r.totalEur, 0);

  const handleToggle = (value: 'google' | 'openai') => {
    setLocalStorage('preferred-llm-provider', value);
  };
  const handleOcrToggle = (value: OcrProviderName) => {
    setLocalStorage('preferred-ocr-provider', value);
  };
  const handleTtsToggle = (value: TtsProviderName) => {
    setLocalStorage('preferred-tts-provider', value);
  };

  const handleHide = () => {
    setLocalStorage('dev-header-hidden', '1');
  };

  const handleShow = () => {
    setLocalStorage('dev-header-hidden', null);
  };

  if (hidden) {
    return (
      <button
        onClick={handleShow}
        className="fixed top-1 right-1 z-50 rounded px-1.5 py-0.5 text-[10px] font-mono bg-surface text-brand border border-brand hover:bg-raised transition-colors"
      >
        DEV
      </button>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="sticky top-0 z-50 flex h-10 items-center gap-4 bg-canvas px-3 text-xs text-fg font-mono border-2 border-brand overflow-x-auto">
        <span className="font-semibold text-brand">DEV</span>

        <Link href="/" className="hover:text-fg transition-colors">
          Public
        </Link>
        <Link href="/admin" className="hover:text-fg transition-colors">
          Admin
        </Link>

        <Link
          href="/admin/costs"
          className="text-fg-subtle hover:text-fg transition-colors"
        >
          API costs: <span className="text-fg">${totalEur.toFixed(4)}</span>
        </Link>

        <Link
          href="/admin/costs"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <UsageBar
            label="Premium"
            used={dailyUsage.premium.used}
            limit={dailyUsage.premium.limit}
          />
          <UsageBar
            label="Mini"
            used={dailyUsage.mini.used}
            limit={dailyUsage.mini.limit}
          />
        </Link>

        {apiCalls && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/admin/api-calls"
                className="text-fg-subtle hover:text-fg transition-colors"
              >
                API:{' '}
                <span className="text-fg">{apiCalls.totalCalls} calls</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-0.5">
                {apiCalls.services.map((s) => (
                  <div key={s.service} className="flex justify-between gap-4">
                    <span>{s.service}</span>
                    <span className="font-mono">
                      {s.count} ({s.avgDurationMs}ms avg)
                    </span>
                  </div>
                ))}
                {apiCalls.services.length === 0 && (
                  <span>No API calls today</span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-fg-subtle mr-1">OCR</span>
          <button
            onClick={() => handleOcrToggle('ocr-space')}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              ocrProvider === 'ocr-space'
                ? 'bg-brand/10 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            OCR.space
          </button>
          <button
            onClick={() => handleOcrToggle('google-vision')}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              ocrProvider === 'google-vision'
                ? 'bg-brand/10 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            Vision
          </button>
          <span className="text-fg-disabled mx-1">|</span>
          <span className="text-fg-subtle mr-1">TTS</span>
          <button
            onClick={() => handleTtsToggle('inworld')}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              ttsProvider === 'inworld'
                ? 'bg-brand/10 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            Inworld
          </button>
          <button
            onClick={() => handleTtsToggle('google-tts')}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              ttsProvider === 'google-tts'
                ? 'bg-brand/10 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            Google
          </button>
          <span className="text-fg-disabled mx-1">|</span>
          <span className="text-fg-subtle mr-1">LLM</span>
          <button
            onClick={() => handleToggle('google')}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              provider === 'google'
                ? 'bg-brand/10 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            Google
          </button>
          <button
            onClick={() => handleToggle('openai')}
            className={`rounded px-1.5 py-0.5 transition-colors ${
              provider === 'openai'
                ? 'bg-brand/10 text-brand'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            OpenAI
          </button>
        </div>

        <button
          onClick={handleHide}
          className="text-fg-subtle hover:text-brand transition-colors ml-1"
          title="Hide dev bar"
        >
          &times;
        </button>
      </div>
    </TooltipProvider>
  );
}
