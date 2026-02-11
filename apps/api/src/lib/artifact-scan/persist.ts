import { prisma } from '@repo/db';
import type { ArtifactDraft, OcrResult } from '@repo/types';
import { createPlaqueImageStorage } from './storage';
import { buildArtifactDisplayTitle } from './display-title';

interface ArtifactEnrichment {
  wikipediaUrl: string | null;
  wikipediaSummary: string | null;
  wikipediaSummaryLang: string | null;
  wikimediaImageUrl: string | null;
}

export async function createArtifactAndAssets(params: {
  museumId: number;
  draft: ArtifactDraft;
  plaqueText: string;
  ocr: OcrResult;
  imageBase64: string;
  enrichment: ArtifactEnrichment;
}): Promise<{ artifactId: number; artifactSlug: string }> {
  const storage = createPlaqueImageStorage();

  // Image storage is an intentional side-effect in the final persistence step.
  const storedImage = await storage.saveImage({
    imageBase64: params.imageBase64,
    museumId: params.museumId,
  });

  const artifact = await prisma.artifact.create({
    data: {
      museumId: params.museumId,
      displayTitle: buildArtifactDisplayTitle({
        localTitle: params.draft.localTitle,
        localTitleLanguage: params.draft.localTitleLanguage,
        englishTitle: params.draft.englishTitle,
      }),
      localTitle: params.draft.localTitle,
      localTitleLanguage: params.draft.localTitleLanguage,
      englishTitle: params.draft.englishTitle,
      rawPlaqueText: params.plaqueText,
      knowledgeTextEn: params.draft.knowledgeText,
      wikipediaUrl: params.enrichment.wikipediaUrl,
      wikipediaSummary: params.enrichment.wikipediaSummary,
      wikipediaSummaryLang: params.enrichment.wikipediaSummaryLang,
      wikimediaImageUrl: params.enrichment.wikimediaImageUrl,
      furtherReading: params.enrichment.wikipediaUrl
        ? [params.enrichment.wikipediaUrl]
        : [],
    } as any,
  });

  await prisma.plaqueScan.create({
    data: {
      artifactId: artifact.id,
      museumId: params.museumId,
      imageUrl: storedImage.imageUrl,
      rawText: params.plaqueText,
      ocrMetadata: {
        provider: params.ocr.provider,
        confidence: params.ocr.confidence,
        languageHints: params.ocr.languageHints,
        blockCount: params.ocr.blocks.length,
      },
    } as any,
  });

  return {
    artifactId: artifact.id,
    artifactSlug: artifact.slug,
  };
}
