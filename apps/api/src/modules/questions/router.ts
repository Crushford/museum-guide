import { Router } from 'express';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import { createHash } from 'crypto';
import { resolve } from 'path';
import createHttpError from 'http-errors';
import { enforceUsageLimits } from '../../lib/usage-limits';
import {
  parseRequiredNumber,
  parseWithSchema,
} from '../../lib/http/validation';
import {
  generateAudioForArtifactQuestion,
  parseTtsProvider,
  getDefaultTtsProvider,
} from '../../lib/audio';
import { createProvider } from '../../lib/llm';
import {
  buildMuseumGuideSystemPrompt,
  buildQuestionAnswerPrompt,
} from '../../lib/llm/prompt-templates';
import {
  checkDailySpendLimit,
  checkSpendLimit,
  recordUsage,
} from '../../lib/llm/cost-tracker';
import {
  sanitizeSensitiveTopics,
  sanitizeSubjectTags,
} from '../../lib/llm/types';
import { moderateTextForLlm } from '../../lib/llm/moderation';
import { withOptionalAudioGeneration } from '../../http/route-helpers';
import {
  questionAskBodySchema,
  questionAskParamsSchema,
  questionListenBodySchema,
  questionsListQuerySchema,
  questionVoteBodySchema,
} from './schemas';

export const router = Router();

const audioDir = resolve(__dirname, '../../../public/audio');

const PROTOTYPE_USERNAME = 'prototype-tester';
const QUESTION_PROMPT_VERSION = '1.0';
const SIMILARITY_THRESHOLD = 0.75;

type ContentProviderName = 'google' | 'openai';

function parseProvider(
  value: unknown,
  fallback: ContentProviderName
): ContentProviderName {
  if (value === 'openai') return 'openai';
  if (value === 'google') return 'google';
  return fallback;
}

function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= shorter.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= longer.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= shorter.length; i++) {
    for (let j = 1; j <= longer.length; j++) {
      if (shorter[i - 1] === longer[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[shorter.length][longer.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}

function normalizeQuestionText(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function fetchArtifactQuestionContext(artifactId: number) {
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    include: {
      museum: {
        select: {
          id: true,
          name: true,
          wikipediaSummary: true,
        },
      },
      room: {
        include: {
          parentRoom: {
            select: {
              id: true,
              name: true,
              museumId: true,
            },
          },
        },
      },
      content: {
        where: { type: 'introduction' },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!artifact) return null;

  return {
    artifact,
    room: artifact.room,
    parentRoom: artifact.room?.parentRoom ?? null,
    museum: artifact.museum ?? null,
    introductionText: artifact.content[0]?.text ?? null,
  };
}

async function suggestQuestionCorrection(
  question: string,
  providerName: ContentProviderName
): Promise<string> {
  const provider = createProvider(providerName);
  const result = await provider.generate({
    systemInstruction: [
      buildMuseumGuideSystemPrompt(),
      'Task: clean up a visitor question for public display.',
      'Only correct obvious spelling, punctuation, and capitalization mistakes.',
      'Preserve meaning and tone.',
      'Do not switch UK vs US spelling if both are correct.',
      'Return only the cleaned question in the text field.',
    ].join('\n'),
    prompt: `Original visitor question:\n${question}`,
  });

  const cleaned = result.text.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return question;
  if (cleaned.length > 280) return question;
  return cleaned;
}

router.get('/artifacts/:artifactId/questions', async (req, res) => {
  const artifactId = parseRequiredNumber(
    req.params.artifactId,
    'Invalid artifactId'
  );
  const { limit, sort } = parseWithSchema(questionsListQuerySchema, req.query);

  const questions = await prisma.artifactQuestion.findMany({
    where: {
      artifactId,
      status: { in: ['ACTIVE', 'ANONYMIZED'] },
      moderationBlocked: false,
      answerText: { not: null },
    },
    orderBy:
      sort === 'new'
        ? [{ createdAt: 'desc' }]
        : [{ upvotes: 'desc' }, { askCount: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      _count: {
        select: {
          listenEvents: true,
        },
      },
    },
  });

  const questionIds = questions.map((q) => q.id);
  const viewerUsername = req.actor?.uid ?? PROTOTYPE_USERNAME;
  const userVoteRecords = await prisma.artifactQuestionVote.findMany({
    where: { questionId: { in: questionIds }, username: viewerUsername },
    select: { questionId: true, value: true },
  });
  const userVoteMap = new Map(
    userVoteRecords.map((v) => [v.questionId, v.value])
  );

  res.json(
    questions.map((question) => ({
      id: question.id,
      artifactId: question.artifactId,
      museumId: question.museumId,
      roomId: question.roomId,
      questionText: question.questionText,
      questionLanguage: question.questionLanguage,
      askedByUsername:
        question.status === 'ANONYMIZED' ? null : question.askedByUsername,
      status: question.status,
      askCount: question.askCount,
      upvotes: question.upvotes,
      downvotes: question.downvotes,
      currentUserVote: userVoteMap.get(question.id) ?? 0,
      similarToQuestionId: question.similarToQuestionId,
      answerText: question.answerText,
      answerLanguage: question.answerLanguage,
      answerAudioUrl: question.answerAudioUrl,
      isAdultContent: question.isAdultContent,
      sensitiveTopics: question.sensitiveTopics,
      subjectTags: question.subjectTags,
      listenCount: question._count.listenEvents,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    }))
  );
});

router.post('/artifacts/:artifactId/questions/ask', async (req, res) => {
  try {
    const { artifactId } = parseWithSchema(
      questionAskParamsSchema,
      req.params,
      'Invalid artifactId'
    );
    if (Number.isNaN(artifactId)) {
      return res.status(400).json({ error: 'Invalid artifactId' });
    }

    const limitsAllowed = await enforceUsageLimits({
      res,
      actor: req.actor,
      globalIncrements: { llmCalls: 1 },
      userIncrements: req.actor ? { llmCalls: 1 } : undefined,
    });
    if (!limitsAllowed) {
      return;
    }

    const {
      questionText,
      forceCreate,
      previewOnly,
      publishAnonymously,
      approvedQuestionText,
    } = parseWithSchema(questionAskBodySchema, req.body);

    const providerName = parseProvider(req.query.provider, 'google');
    const ttsProvider = parseTtsProvider(
      req.query.ttsProvider,
      getDefaultTtsProvider()
    );
    const correctedQuestion =
      approvedQuestionText ??
      (await suggestQuestionCorrection(questionText, providerName));

    if (previewOnly) {
      return res.json({
        previewOnly: true,
        originalQuestion: questionText,
        correctedQuestion,
        hasCorrections: correctedQuestion !== questionText,
      });
    }

    const publishQuestion = (approvedQuestionText ?? correctedQuestion).trim();
    if (publishQuestion.length < 8) {
      return res
        .status(400)
        .json({ error: 'Question is too short (minimum 8 characters).' });
    }
    if (publishQuestion.length > 280) {
      return res
        .status(400)
        .json({ error: 'Question is too long (maximum 280 characters).' });
    }

    const context = await fetchArtifactQuestionContext(artifactId);
    if (!context) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const normalizedQuestion = normalizeQuestionText(publishQuestion);
    const questionHash = hashText(normalizedQuestion);
    const existing = await prisma.artifactQuestion.findMany({
      where: {
        artifactId,
        status: { in: ['ACTIVE', 'ANONYMIZED'] },
      },
      select: {
        id: true,
        questionText: true,
        answerText: true,
        upvotes: true,
        downvotes: true,
      },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });

    let mostSimilar: {
      id: number;
      questionText: string;
      answerText: string | null;
      similarity: number;
      upvotes: number;
      downvotes: number;
    } | null = null;

    for (const row of existing) {
      const similarity = stringSimilarity(
        normalizedQuestion,
        normalizeQuestionText(row.questionText)
      );
      if (!mostSimilar || similarity > mostSimilar.similarity) {
        mostSimilar = {
          id: row.id,
          questionText: row.questionText,
          answerText: row.answerText,
          similarity,
          upvotes: row.upvotes,
          downvotes: row.downvotes,
        };
      }
    }

    if (
      mostSimilar &&
      mostSimilar.similarity >= SIMILARITY_THRESHOLD &&
      !forceCreate
    ) {
      return res.json({
        requiresConfirmation: true,
        similarQuestion: mostSimilar,
      });
    }

    let moderation;
    try {
      moderation = await moderateTextForLlm(
        publishQuestion,
        'artifact-question-submit'
      );
    } catch (error) {
      return res.status(503).json({
        error:
          error instanceof Error
            ? error.message
            : 'Moderation unavailable, cannot publish question right now.',
      });
    }
    if (moderation.blocked) {
      const blockedQuestion = await prisma.artifactQuestion.create({
        data: {
          artifactId: context.artifact.id,
          museumId: context.artifact.museumId,
          roomId: context.artifact.roomId ?? null,
          questionText: publishQuestion,
          normalizedQuestion,
          questionHash,
          askedByUsername: req.actor?.uid ?? PROTOTYPE_USERNAME,
          status: 'HIDDEN',
          moderationBlocked: true,
          moderationCategories: moderation.categories,
          moderationPayload: {
            source: moderation.source,
            categories: moderation.categories,
          } as Prisma.InputJsonValue,
          similarToQuestionId:
            mostSimilar && mostSimilar.similarity >= SIMILARITY_THRESHOLD
              ? mostSimilar.id
              : null,
        },
      });

      return res.status(403).json({
        error:
          'This question could not be posted because it violates community safety rules.',
        blocked: true,
        questionId: blockedQuestion.id,
      });
    }

    const spendMonthly = await checkSpendLimit(providerName);
    if (!spendMonthly.allowed) {
      return res.status(429).json({
        error: `Monthly ${providerName} spend limit reached (€${spendMonthly.currentSpendEur.toFixed(2)} / €${spendMonthly.limitEur?.toFixed(2)}).`,
      });
    }
    const spendDaily = await checkDailySpendLimit(providerName);
    if (!spendDaily.allowed) {
      return res.status(429).json({
        error: `Daily ${providerName} spend limit reached (€${spendDaily.currentSpendEur.toFixed(2)} / €${spendDaily.limitEur?.toFixed(2)}).`,
      });
    }

    const prompt = buildQuestionAnswerPrompt({
      artifactName: context.artifact.displayTitle,
      plaqueText:
        context.artifact.wikipediaSummary ||
        context.artifact.knowledgeTextEn ||
        context.artifact.rawPlaqueText,
      museumName: context.museum?.name ?? null,
      roomName: context.room?.name ?? null,
      parentRoomName: context.parentRoom?.name ?? null,
      museumSummary: context.museum?.wikipediaSummary ?? null,
      introductionText: context.introductionText,
      userQuestion: publishQuestion,
    });

    const provider = createProvider(providerName);
    const result = await provider.generate({
      prompt,
      systemInstruction: buildMuseumGuideSystemPrompt(),
    });

    const answerText = result.text.trim();
    if (!answerText) {
      throw new Error('LLM provider returned an empty answer text.');
    }

    const question = await prisma.artifactQuestion.create({
      data: {
        artifactId: context.artifact.id,
        museumId: context.artifact.museumId,
        roomId: context.artifact.roomId ?? null,
        questionText: publishQuestion,
        normalizedQuestion,
        questionHash,
        questionLanguage: null,
        askedByUsername: req.actor?.uid ?? PROTOTYPE_USERNAME,
        status: publishAnonymously ? 'ANONYMIZED' : 'ACTIVE',
        similarToQuestionId:
          mostSimilar && mostSimilar.similarity >= SIMILARITY_THRESHOLD
            ? mostSimilar.id
            : null,
        answerText,
        answerLanguage: null,
        isAdultContent: result.isAdultContent === true,
        sensitiveTopics: sanitizeSensitiveTopics(result.sensitiveTopics),
        subjectTags: sanitizeSubjectTags(result.subjectTags),
        moderationBlocked: false,
        llmProvider: result.provider,
        model: result.model,
        prompt,
        promptVersion: QUESTION_PROMPT_VERSION,
      },
    });

    // Auto-upvote from the question asker.
    // BUG: The vote record is stored correctly, but the client doesn't reliably
    // reflect it as active on first render — the upvote arrow may not highlight
    // and clicking upvote may not toggle it off. The create response includes
    // `upvotes: 1` but doesn't include `currentUserVote: 1`, so the frontend
    // can't seed its userVotes state from this response. See TODO.md for fix.
    const askerUsername = req.actor?.uid ?? PROTOTYPE_USERNAME;
    await prisma.artifactQuestionVote.create({
      data: { questionId: question.id, username: askerUsername, value: 1 },
    });
    await prisma.artifactQuestion.update({
      where: { id: question.id },
      data: { upvotes: 1 },
    });

    const { audioUrl: answerAudioUrl } = await withOptionalAudioGeneration({
      logLabel: '[questions.ask] Audio generation failed',
      logContext: {
        artifactId,
        questionId: question.id,
        ttsProvider,
      },
      generate: () =>
        generateAudioForArtifactQuestion(question.id, answerText, {
          outputDir: audioDir,
          provider: ttsProvider,
        }),
      persist: async (audioUrl) => {
        await prisma.artifactQuestion.update({
          where: { id: question.id },
          data: { answerAudioUrl: audioUrl },
        });
      },
    });

    await recordUsage({
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      apiCallId: result.apiCallId ?? null,
      artifactId: artifactId,
    });

    res.json({
      requiresConfirmation: false,
      question: {
        ...question,
        upvotes: 1,
        answerAudioUrl: answerAudioUrl ?? question.answerAudioUrl,
      },
    });
  } catch (error) {
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Failed to answer question',
    });
  }
});

router.post('/artifact-questions/:questionId/vote', async (req, res) => {
  const questionId = parseRequiredNumber(
    req.params.questionId,
    'Invalid questionId'
  );
  const { vote } = parseWithSchema(
    questionVoteBodySchema,
    req.body,
    'vote must be "up" or "down"'
  );

  const username = req.actor?.uid ?? PROTOTYPE_USERNAME;
  const value = vote === 'up' ? 1 : -1;
  const existing = await prisma.artifactQuestionVote.findUnique({
    where: { questionId_username: { questionId, username } },
  });

  if (existing && existing.value === value) {
    await prisma.artifactQuestionVote.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.artifactQuestionVote.update({
      where: { id: existing.id },
      data: { value },
    });
  } else {
    await prisma.artifactQuestionVote.create({
      data: { questionId, username, value },
    });
  }

  const [upvotes, downvotes] = await Promise.all([
    prisma.artifactQuestionVote.count({ where: { questionId, value: 1 } }),
    prisma.artifactQuestionVote.count({ where: { questionId, value: -1 } }),
  ]);

  const currentVote = await prisma.artifactQuestionVote.findUnique({
    where: { questionId_username: { questionId, username } },
  });

  await prisma.artifactQuestion.update({
    where: { id: questionId },
    data: { upvotes, downvotes },
  });

  res.json({
    questionId,
    upvotes,
    downvotes,
    currentUserVote: currentVote?.value ?? 0,
  });
});

router.post('/artifact-questions/:questionId/use', async (req, res) => {
  const questionId = parseRequiredNumber(
    req.params.questionId,
    'Invalid questionId'
  );

  const question = await prisma.artifactQuestion.update({
    where: { id: questionId },
    data: {
      askCount: { increment: 1 },
    },
  });

  res.json({
    id: question.id,
    askCount: question.askCount,
  });
});

router.post('/artifact-questions/:questionId/listen', async (req, res) => {
  const questionId = parseRequiredNumber(
    req.params.questionId,
    'Invalid questionId'
  );
  const { durationSeconds, completed, sessionId, source } = parseWithSchema(
    questionListenBodySchema,
    req.body
  );

  await prisma.artifactQuestionListenEvent.create({
    data: {
      questionId,
      username: PROTOTYPE_USERNAME,
      sessionId,
      durationSeconds,
      completed,
      source,
    },
  });

  res.json({ ok: true });
});
