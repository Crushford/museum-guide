import { useMemo } from 'react';

export function usePreferredLLMProvider() {
  return useMemo(() => {
    if (typeof window === 'undefined') return 'openai';
    const stored = localStorage.getItem('preferred-llm-provider');
    return stored === 'google' || stored === 'openai' ? stored : 'openai';
  }, []);
}
