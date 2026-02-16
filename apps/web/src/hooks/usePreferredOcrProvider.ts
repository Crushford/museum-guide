import { useMemo } from 'react';
import type { OcrProviderName } from '@repo/types';

export function usePreferredOcrProvider(): OcrProviderName {
  return useMemo(() => {
    if (typeof window === 'undefined') return 'ocr-space';
    const stored = localStorage.getItem('preferred-ocr-provider');
    return stored === 'google-vision' || stored === 'ocr-space'
      ? stored
      : 'ocr-space';
  }, []);
}
