import { prisma } from '@repo/db';
import { createProvider } from './index';
import { checkSpendLimit } from './cost-tracker';
import { recordUsage } from './cost-tracker';
import { traceGeneration } from '../telemetry/langfuse';
import { generateAudioForContent } from '../audio';

const PROMPT_VERSION = '1.0';

export function buildIntroductionPrompt(
  artifact: { name: string; knowledgeText: string | null },
  room?: { name: string; parentRoom?: { name: string } | null } | null,
  museum?: { name: string } | null
): string {
  const museumName = museum?.name || 'Museum Name';
  const roomName = room?.name || 'Room Name';
  const parentRoomName = room?.parentRoom?.name;

  const location = parentRoomName
    ? `${parentRoomName} - ${roomName}`
    : roomName;

  const plaqueInfo =
    artifact.knowledgeText || 'No plaque information available.';

  return `Your role is as a museum guide, the museum you are guiding today is the ${museumName}, we are currently in the ${location} and the artefact you are introducing is: ${artifact.name}, here is the information from the plaque for your reference:
${plaqueInfo}`;
}

export async function fetchArtifactWithRelations(artifactId: number) {
  return prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      room: {
        include: {
          museum: { select: { id: true, name: true } },
          parentRoom: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function generateIntroduction(
  artifactId: number,
  providerName: 'google' | 'openai',
  audioDir: string
): Promise<{
  content: {
    id: number;
    text: string;
    type: string | null;
    llmProvider: string;
    model: string;
    audioUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    promptVersion: string;
  };
  usage: { inputTokens: number; outputTokens: number; durationMs: number };
}> {
  // 1. Check spend limit
  const spendCheck = await checkSpendLimit(providerName);
  if (!spendCheck.allowed) {
    throw new SpendLimitError(
      `Monthly spend limit reached for ${providerName}: €${spendCheck.currentSpendEur.toFixed(2)} / €${spendCheck.limitEur?.toFixed(2)}`,
      spendCheck.currentSpendEur,
      spendCheck.limitEur!
    );
  }

  // 2. Fetch artifact
  const artifact = await fetchArtifactWithRelations(artifactId);
  if (!artifact) throw new Error('Artifact not found');

  const room = artifact.room;
  const museum = room?.museum || null;

  // 3. Build prompt
  const prompt = buildIntroductionPrompt(artifact, room, museum);

  // 4. Generate
  const provider = createProvider(providerName);
  const result = await provider.generate({ prompt });

  // 5. Upsert content — update existing introduction for this provider, or create new
  const existing = await prisma.content.findFirst({
    where: { artifactId, type: 'introduction', llmProvider: providerName },
  });

  let content;
  if (existing) {
    content = await prisma.content.update({
      where: { id: existing.id },
      data: {
        text: result.text,
        llmProvider: result.provider,
        model: result.model,
        prompt,
        promptVersion: PROMPT_VERSION,
        isAdultContent: result.isAdultContent ?? false,
        sensitiveTopics: result.sensitiveTopics ?? [],
        subjectTags: result.subjectTags ?? [],
      },
    });
  } else {
    content = await prisma.content.create({
      data: {
        text: result.text,
        type: 'introduction',
        artifactId,
        llmProvider: result.provider,
        model: result.model,
        prompt,
        promptVersion: PROMPT_VERSION,
        isAdultContent: result.isAdultContent ?? false,
        sensitiveTopics: result.sensitiveTopics ?? [],
        subjectTags: result.subjectTags ?? [],
      },
    });
  }

  // 6. Record cost
  await recordUsage({
    provider: result.provider,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    contentId: content.id,
    artifactId,
  });

  // 7. Trace to Langfuse
  traceGeneration({
    name: 'generate-introduction',
    input: prompt,
    output: result.text,
    model: result.model,
    provider: result.provider,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: result.durationMs,
    metadata: { artifactId, promptVersion: PROMPT_VERSION },
  });

  // 8. Generate audio
  try {
    const audioUrl = await generateAudioForContent(content.id, result.text, {
      outputDir: audioDir,
    });
    content = await prisma.content.update({
      where: { id: content.id },
      data: { audioUrl },
    });
  } catch (audioErr) {
    console.error('[generateIntroduction] Audio generation failed:', audioErr);
  }

  return {
    content,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
    },
  };
}

export class SpendLimitError extends Error {
  currentSpendEur: number;
  limitEur: number;
  constructor(message: string, currentSpendEur: number, limitEur: number) {
    super(message);
    this.name = 'SpendLimitError';
    this.currentSpendEur = currentSpendEur;
    this.limitEur = limitEur;
  }
}
