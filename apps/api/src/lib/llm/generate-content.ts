import { prisma } from '@repo/db';
import { createProvider } from './index';
import { checkSpendLimit } from './cost-tracker';
import { recordUsage } from './cost-tracker';
import { traceGeneration } from '../telemetry/langfuse';
import { generateAudioForContent, type TtsProviderName } from '../audio';
import {
  buildIntroductionPrompt,
  buildMuseumGuideSystemPrompt,
} from './prompt-templates';

const PROMPT_VERSION = '1.0';

export async function fetchArtifactWithRelations(artifactId: number) {
  return prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      museum: { select: { id: true, name: true, wikipediaSummary: true } },
      room: {
        include: {
          parentRoom: { select: { id: true, name: true, museumId: true } },
        },
      },
    },
  });
}

export async function generateIntroduction(
  artifactId: number,
  providerName: 'google' | 'openai',
  ttsProvider: TtsProviderName
): Promise<{
  content: {
    id: number;
    text: string;
    type: string | null;
    llmProvider: string;
    model: string;
    suggestedQuestions: string[];
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
  const museum = artifact.museum || null;

  // 3. Build prompt
  const prompt = buildIntroductionPrompt({
    artifactName: artifact.displayTitle,
    plaqueText: artifact.rawPlaqueText ?? artifact.knowledgeTextEn,
    museumName: museum?.name ?? null,
    roomName: room?.name ?? null,
    parentRoomName: room?.parentRoom?.name ?? null,
    museumSummary: museum?.wikipediaSummary ?? null,
  });

  // 4. Generate
  const provider = createProvider(providerName);
  const result = await provider.generate({
    prompt,
    systemInstruction: buildMuseumGuideSystemPrompt(),
  });

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
        suggestedQuestions: result.suggestedQuestions ?? [],
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
        suggestedQuestions: result.suggestedQuestions ?? [],
      },
    });
  }

  // 6. Record cost
  await recordUsage({
    provider: result.provider,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: result.durationMs,
    apiCallId: result.apiCallId ?? null,
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
      provider: ttsProvider,
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
