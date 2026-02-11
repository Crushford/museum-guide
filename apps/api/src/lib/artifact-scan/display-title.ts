export function isEnglishLanguageCode(
  value: string | null | undefined
): boolean {
  if (!value) return false;
  return value.toLowerCase().startsWith('en');
}

export function buildArtifactDisplayTitle(params: {
  localTitle: string;
  localTitleLanguage?: string | null;
  englishTitle?: string | null;
}): string {
  const localTitle = params.localTitle.trim();
  const englishTitle = params.englishTitle?.trim() || '';

  if (!localTitle) return englishTitle || 'Untitled artefact';
  if (
    !englishTitle ||
    englishTitle.toLowerCase() === localTitle.toLowerCase()
  ) {
    return localTitle;
  }

  if (isEnglishLanguageCode(params.localTitleLanguage)) {
    return localTitle;
  }

  return `${localTitle} (${englishTitle})`;
}
