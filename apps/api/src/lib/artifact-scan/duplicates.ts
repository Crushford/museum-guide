import { prisma } from '@repo/db';
import type {
  ArtifactDraft,
  ArtifactCandidate,
  DuplicateSearchResult,
} from '@repo/types';
import {
  firstLikelyTitleLine,
  keywordOverlap,
  trigramSimilarity,
} from './similarity';

type CandidateRecord = {
  id: number;
  slug: string;
  displayTitle: string;
  localTitle: string | null;
  englishTitle: string | null;
  rawPlaqueText: string | null;
  knowledgeTextEn: string | null;
};

const DUPLICATE_THRESHOLDS = {
  strong: 0.72,
  plausible: 0.52,
  gap: 0.12,
} as const;

function chooseOutcome(candidates: ArtifactCandidate[]): DuplicateSearchResult {
  if (candidates.length === 0) {
    return {
      outcome: 'no_match',
      candidates: [],
      thresholds: { ...DUPLICATE_THRESHOLDS },
    };
  }

  const [top, second] = candidates;
  const gap = top.score - (second?.score ?? 0);

  if (
    top.score >= DUPLICATE_THRESHOLDS.strong &&
    gap >= DUPLICATE_THRESHOLDS.gap
  ) {
    return {
      outcome: 'single_strong_match',
      candidates: [top],
      thresholds: { ...DUPLICATE_THRESHOLDS },
    };
  }

  const plausibleCandidates = candidates.filter(
    (candidate) => candidate.score >= DUPLICATE_THRESHOLDS.plausible
  );

  if (plausibleCandidates.length > 0) {
    return {
      outcome: 'multiple_candidates',
      candidates: plausibleCandidates,
      thresholds: { ...DUPLICATE_THRESHOLDS },
    };
  }

  return {
    outcome: 'no_match',
    candidates: [],
    thresholds: { ...DUPLICATE_THRESHOLDS },
  };
}

function candidateTitle(record: CandidateRecord): string {
  return record.localTitle || record.displayTitle;
}

function mapCandidate(
  record: CandidateRecord,
  score: number,
  reasons: string[]
): ArtifactCandidate {
  return {
    artifactId: record.id,
    slug: record.slug,
    localTitle: candidateTitle(record),
    englishTitle: record.englishTitle,
    score,
    reasons,
  };
}

function scoreRawTextCandidate(
  rawText: string,
  titleHint: string,
  record: CandidateRecord
): ArtifactCandidate | null {
  const localTitle = candidateTitle(record);
  const titleScore = trigramSimilarity(titleHint, localTitle);
  const englishTitleScore = record.englishTitle
    ? trigramSimilarity(titleHint, record.englishTitle)
    : 0;

  const bestTitleScore = Math.max(titleScore, englishTitleScore);

  const ocrOverlap = Math.max(
    keywordOverlap(rawText, record.rawPlaqueText ?? ''),
    keywordOverlap(rawText, record.knowledgeTextEn ?? '')
  );

  const rawTextSimilarity = trigramSimilarity(
    rawText,
    record.rawPlaqueText ?? ''
  );

  // Favor title matching, but allow near-identical plaque text rescans
  // to short-circuit before LLM calls.
  const weightedScore =
    bestTitleScore * 0.65 + ocrOverlap * 0.15 + rawTextSimilarity * 0.2;
  const finalScore = Math.max(weightedScore, rawTextSimilarity * 0.95);

  if (finalScore < DUPLICATE_THRESHOLDS.plausible) {
    return null;
  }

  const reasons: string[] = [];
  reasons.push(`title similarity ${(bestTitleScore * 100).toFixed(0)}%`);
  if (ocrOverlap > 0) {
    reasons.push(`OCR keyword overlap ${(ocrOverlap * 100).toFixed(0)}%`);
  }
  if (rawTextSimilarity > 0) {
    reasons.push(
      `plaque text similarity ${(rawTextSimilarity * 100).toFixed(0)}%`
    );
  }

  return mapCandidate(record, finalScore, reasons);
}

function scoreDraftCandidate(
  draft: ArtifactDraft,
  record: CandidateRecord
): ArtifactCandidate | null {
  const localTitle = candidateTitle(record);
  const localScore = trigramSimilarity(draft.localTitle, localTitle);
  const englishScore = record.englishTitle
    ? trigramSimilarity(draft.englishTitle, record.englishTitle)
    : trigramSimilarity(draft.englishTitle, localTitle);

  const crossScore = Math.max(
    trigramSimilarity(draft.localTitle, record.englishTitle ?? ''),
    trigramSimilarity(draft.englishTitle, localTitle)
  );

  const finalScore = localScore * 0.45 + englishScore * 0.45 + crossScore * 0.1;

  if (finalScore < DUPLICATE_THRESHOLDS.plausible) {
    return null;
  }

  const reasons = [
    `local title ${(localScore * 100).toFixed(0)}%`,
    `english title ${(englishScore * 100).toFixed(0)}%`,
  ];

  return mapCandidate(record, finalScore, reasons);
}

async function loadMuseumArtifacts(
  museumId: number
): Promise<CandidateRecord[]> {
  try {
    const artifacts = await prisma.artifact.findMany({
      where: { museumId },
      select: {
        id: true,
        slug: true,
        displayTitle: true,
        localTitle: true,
        englishTitle: true,
        rawPlaqueText: true,
        knowledgeTextEn: true,
      } as any,
    });

    return artifacts as unknown as CandidateRecord[];
  } catch (error) {
    const prismaCode =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;

    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);

    const isMissingColumn =
      prismaCode === 'P2022' || message.includes('does not exist');
    if (!isMissingColumn) {
      throw error;
    }

    const fallbackArtifactsRaw = await prisma.artifact.findMany({
      where: { museumId },
      select: {
        id: true,
        slug: true,
        displayTitle: true,
        knowledgeTextEn: true,
      } as any,
    });

    const fallbackArtifacts = fallbackArtifactsRaw as unknown as Array<{
      id: number;
      slug: string;
      displayTitle: string;
      knowledgeTextEn: string | null;
    }>;

    return fallbackArtifacts.map((artifact) => ({
      id: artifact.id,
      slug: artifact.slug,
      displayTitle: artifact.displayTitle,
      localTitle: null,
      englishTitle: null,
      rawPlaqueText: null,
      knowledgeTextEn: artifact.knowledgeTextEn,
    }));
  }
}

export async function searchDuplicatesFromRawText(
  museumId: number,
  rawText: string
): Promise<DuplicateSearchResult> {
  const artifacts = await loadMuseumArtifacts(museumId);
  const titleHint = firstLikelyTitleLine(rawText);

  const candidates = artifacts
    .map((artifact) => scoreRawTextCandidate(rawText, titleHint, artifact))
    .filter((candidate): candidate is ArtifactCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return chooseOutcome(candidates);
}

export async function searchDuplicatesFromDraft(
  museumId: number,
  draft: ArtifactDraft
): Promise<DuplicateSearchResult> {
  const artifacts = await loadMuseumArtifacts(museumId);

  const candidates = artifacts
    .map((artifact) => scoreDraftCandidate(draft, artifact))
    .filter((candidate): candidate is ArtifactCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return chooseOutcome(candidates);
}
