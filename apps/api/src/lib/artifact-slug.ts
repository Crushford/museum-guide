import { prisma } from '@repo/db';
import { generateSlug } from './slug';

export function buildMuseumArtifactSlugBase(params: {
  museumSlugOrName: string;
  artifactName: string;
}): string {
  const museumSlug = generateSlug(params.museumSlugOrName);
  const artifactSlug = generateSlug(params.artifactName) || 'artifact';

  if (!museumSlug) return artifactSlug;
  if (artifactSlug.startsWith(`${museumSlug}-`)) return artifactSlug;
  return `${museumSlug}-${artifactSlug}`;
}

export async function buildUniqueArtifactSlug(params: {
  museumId: number;
  museumSlugOrName: string;
  artifactName: string;
  currentArtifactId?: number;
}): Promise<string> {
  const baseSlug = buildMuseumArtifactSlugBase({
    museumSlugOrName: params.museumSlugOrName,
    artifactName: params.artifactName,
  });

  let candidate = baseSlug || `artifact-${Date.now()}`;
  let suffix = 2;

  while (true) {
    const existing = await prisma.artifact.findFirst({
      where: {
        museumId: params.museumId,
        slug: candidate,
        ...(params.currentArtifactId
          ? { id: { not: params.currentArtifactId } }
          : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix++}`;
  }
}
