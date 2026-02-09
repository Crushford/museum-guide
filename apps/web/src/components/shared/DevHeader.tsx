'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type SpendRow = {
  provider: string;
  totalEur: number;
};

export function DevHeader() {
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [provider, setProvider] = useState<'google' | 'openai'>(() => {
    if (typeof window === 'undefined') return 'google';
    const stored = localStorage.getItem('preferred-llm-provider');
    return stored === 'google' || stored === 'openai' ? stored : 'google';
  });

  useEffect(() => {
    fetch(`${API_URL}/admin/llm-usage/monthly`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.spend) setSpend(data.spend);
      })
      .catch(() => {});
  }, []);

  const totalEur = spend.reduce((sum, r) => sum + r.totalEur, 0);

  const handleToggle = (value: 'google' | 'openai') => {
    setProvider(value);
    localStorage.setItem('preferred-llm-provider', value);
  };

  return (
    <div className="sticky top-0 z-50 flex h-8 items-center gap-4 bg-zinc-900 px-3 text-xs text-zinc-300 font-mono">
      <span className="font-semibold text-amber-400">DEV</span>

      <Link href="/" className="hover:text-white transition-colors">
        Public
      </Link>
      <Link href="/admin" className="hover:text-white transition-colors">
        Admin
      </Link>

      <span className="ml-auto text-zinc-500">
        Month: <span className="text-zinc-300">{totalEur.toFixed(4)}</span>
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => handleToggle('google')}
          className={`rounded px-1.5 py-0.5 transition-colors ${
            provider === 'google'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Google
        </button>
        <button
          onClick={() => handleToggle('openai')}
          className={`rounded px-1.5 py-0.5 transition-colors ${
            provider === 'openai'
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          OpenAI
        </button>
      </div>
    </div>
  );
}
