import { useMemo } from 'react';

export type TtsProviderName = 'google-tts' | 'inworld';

export function usePreferredTTSProvider(): TtsProviderName {
  return useMemo(() => {
    if (typeof window === 'undefined') return 'inworld';
    const stored = localStorage.getItem('preferred-tts-provider');
    return stored === 'google-tts' || stored === 'inworld'
      ? stored
      : 'inworld';
  }, []);
}
