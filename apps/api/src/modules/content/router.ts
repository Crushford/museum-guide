import { Router } from 'express';
import { prisma } from '@repo/db';
import type { Prisma } from '@repo/db';
import createHttpError from 'http-errors';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import { enforceUsageLimits } from '../../lib/usage-limits';
import {
  parseRequiredNumber,
  parseWithSchema,
} from '../../lib/http/validation';
import {
  generateAudioForContent,
  parseTtsProvider,
  getDefaultTtsProvider,
} from '../../lib/audio';
import { createProvider } from '../../lib/llm';
import {
  buildIntroductionPrompt,
  buildMuseumGuideSystemPrompt,
} from '../../lib/llm/prompt-templates';
import { recordUsage } from '../../lib/llm/cost-tracker';
import { assertTextAllowedForLlm } from '../../lib/llm/moderation';
import { recordApiCall } from '../../lib/telemetry/api-call-tracker';
import { fetchWikipediaSummaryWithTranslation } from '../../lib/wikidata';
import { env } from '../../config/env';
import {
  enforceAdminActionGuards,
  withOptionalAudioGeneration,
} from '../../http/route-helpers';
import { createSseWriter } from '../../http/sse';
import {
  contentCreateBodySchema,
  ttsProviderBodySchema,
  wikipediaSummaryQuerySchema,
} from './schemas';

export const router = Router();

type ContentProviderName = 'google' | 'openai';

function parseProvider(
  value: unknown,
  fallback: ContentProviderName
): ContentProviderName {
  if (value === 'openai') return 'openai';
  if (value === 'google') return 'google';
  return fallback;
}

async function fetchArtifactContext(artifactId: number) {
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
    },
  });

  if (!artifact) return null;

  const room = artifact.room;
  const museum = artifact.museum || null;
  const parentRoom = room?.parentRoom || null;

  const template = buildIntroductionPrompt({
    artifactName: artifact.displayTitle,
    plaqueText: artifact.rawPlaqueText ?? artifact.knowledgeTextEn,
    museumName: museum?.name ?? null,
    roomName: room?.name ?? null,
    parentRoomName: parentRoom?.name ?? null,
    museumSummary: museum?.wikipediaSummary ?? null,
  });

  return { artifact, room, museum, parentRoom, template };
}

router.post('/content', requireAuth, requireAdmin, async (req, res) => {
  const {
    text,
    type,
    museumId,
    roomId,
    artifactId,
    llmProvider,
    model,
    prompt,
  } = parseWithSchema(contentCreateBodySchema, req.body);

  const content = await prisma.content.create({
    data: {
      text,
      type,
      museumId,
      roomId,
      artifactId,
      llmProvider: llmProvider || 'manual',
      model: model || 'manual',
      prompt: prompt || '',
    },
  });

  res.json(content);
});

router.get('/museums/:museumId/content', async (req, res) => {
  const museumId = parseRequiredNumber(req.params.museumId, 'Invalid museumId');

  const content = await prisma.content.findMany({
    where: { museumId: museumId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

router.get('/rooms/:roomId/content', async (req, res) => {
  const roomId = parseRequiredNumber(req.params.roomId, 'Invalid roomId');

  const content = await prisma.content.findMany({
    where: { roomId: roomId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

router.get('/artifacts/:artifactId/content', async (req, res) => {
  const artifactId = parseRequiredNumber(
    req.params.artifactId,
    'Invalid artifactId'
  );

  const content = await prisma.content.findMany({
    where: { artifactId: artifactId },
    orderBy: { id: 'asc' },
  });

  res.json(content);
});

// GET /admin/content/museums - Get all museums
router.get(
  '/admin/content/museums',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const museums = await prisma.museum.findMany({
        orderBy: { id: 'asc' },
      });
      res.set('Cache-Control', 'no-store');
      res.json(museums);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch museums';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /admin/content/rooms - Get all rooms
router.get(
  '/admin/content/rooms',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const rooms = await prisma.room.findMany({
        orderBy: { id: 'asc' },
      });
      res.set('Cache-Control', 'no-store');
      res.json(rooms);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch rooms';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /admin/content/artifacts - Get all artifacts (read-only) with enriched data
router.get(
  '/admin/content/artifacts',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      // Fetch all rooms with their museum and parentRoom info to build a lookup map
      const allRooms = await prisma.room.findMany({
        select: {
          id: true,
          name: true,
          museumId: true,
          parentRoomId: true,
          museum: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // Fetch all museums for direct lookup
      const allMuseums = await prisma.museum.findMany({
        select: {
          id: true,
          name: true,
        },
      });
      const museumMap = new Map(allMuseums.map((m) => [m.id, m]));

      // Build a map for quick lookup
      const roomMap = new Map(allRooms.map((room) => [room.id, room]));

      // Helper function to find museum by traversing up parent room chain
      const findMuseumForRoom = (
        roomId: number | null
      ): { id: number; name: string } | null => {
        if (!roomId) return null;
        const room = roomMap.get(roomId);
        if (!room) return null;

        // If room has museum directly, return it
        if (room.museum) {
          return room.museum;
        }

        // Otherwise, traverse up parent room chain
        if (room.parentRoomId) {
          return findMuseumForRoom(room.parentRoomId);
        }

        return null;
      };

      const artifacts = await prisma.artifact.findMany({
        include: {
          room: {
            select: {
              id: true,
              name: true,
              parentRoomId: true,
            },
          },
        } as Prisma.ArtifactInclude,
        orderBy: {
          id: 'asc',
        },
      });

      const response = artifacts.map((artifact) => {
        // Type assertion to work around Prisma type inference issue
        const artifactWithRoom = artifact as typeof artifact & {
          roomId: number | null;
          museumId: number;
          displayTitle: string;
          slug: string;
          rawPlaqueText: string | null;
          furtherReading: string[];
          room: {
            id: number;
            name: string;
            parentRoomId: number | null;
          } | null;
        };

        // Find museum - use direct museumId if available, otherwise traverse room chain
        let museum: { id: number; name: string } | null = null;
        if (artifactWithRoom.museumId) {
          // Use direct museumId from artifact
          museum = museumMap.get(artifactWithRoom.museumId) || null;
        } else if (artifactWithRoom.room) {
          // Fallback to room chain traversal if no direct museumId
          museum = findMuseumForRoom(artifactWithRoom.room.id);
        }

        // Get parent room name
        const parentRoom = artifactWithRoom.room?.parentRoomId
          ? roomMap.get(artifactWithRoom.room.parentRoomId)
          : null;

        return {
          id: artifactWithRoom.id,
          name: artifactWithRoom.displayTitle,
          slug: artifactWithRoom.slug,
          roomId: artifactWithRoom.roomId,
          roomName: artifactWithRoom.room?.name || null,
          museumId: museum?.id || artifactWithRoom.museumId,
          museumName: museum?.name || null,
          rawPlaqueText: artifactWithRoom.rawPlaqueText,
          furtherReading: artifactWithRoom.furtherReading,
          parentRoomId: artifactWithRoom.room?.parentRoomId || null,
          parentRoomName: parentRoom?.name || null,
        };
      });

      res.set('Cache-Control', 'no-store');
      res.json(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch artifacts';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /admin/content/content - Get all content rows
router.get(
  '/admin/content/content',
  requireAuth,
  requireAdmin,
  async (_req, res) => {
    try {
      const content = await prisma.content.findMany({
        select: {
          id: true,
          type: true,
          text: true,
          createdAt: true,
          museumId: true,
          roomId: true,
          artifactId: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json(content);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch content';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// POST /generate-content/artefact/:artefactId - Generate content
router.post(
  '/generate-content/artefact/:artefactId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const actor = await enforceAdminActionGuards({
        req,
        res,
        requireSignup: true,
        usage: {
          globalIncrements: { llmCalls: 1, dbOps: 1 },
          userIncrements: { llmCalls: 1 },
        },
      });
      if (!actor) {
        return;
      }

      const artefactId = parseRequiredNumber(
        req.params.artefactId,
        'Invalid artefactId'
      );

      const context = await fetchArtifactContext(artefactId);
      if (!context) {
        return res.status(404).json({ error: 'Artifact not found' });
      }

      const providerName = parseProvider(req.query.provider, 'google');
      const { ttsProvider: ttsProviderInput } = parseWithSchema(
        ttsProviderBodySchema,
        req.body
      );
      const ttsProvider = parseTtsProvider(
        ttsProviderInput,
        getDefaultTtsProvider()
      );
      const provider = createProvider(providerName);

      const result = await provider.generate({
        prompt: context.template,
        systemInstruction: buildMuseumGuideSystemPrompt(),
      });

      const content = await prisma.content.create({
        data: {
          text: result.text,
          type: 'introduction',
          artifactId: artefactId,
          llmProvider: result.provider,
          model: result.model,
          prompt: context.template,
          suggestedQuestions: result.suggestedQuestions ?? [],
        },
      });

      await withOptionalAudioGeneration({
        logLabel: '[generate-content.post] Audio generation failed',
        logContext: {
          artifactId: artefactId,
          contentId: content.id,
          ttsProvider,
        },
        generate: () =>
          generateAudioForContent(content.id, result.text, {
            provider: ttsProvider,
          }),
        persist: async (audioUrl) => {
          await prisma.content.update({
            where: { id: content.id },
            data: { audioUrl },
          });
        },
      });

      const updatedContent = await prisma.content.findUnique({
        where: { id: content.id },
      });

      res.json(updatedContent);
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      let errorMessage = 'Failed to generate content';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (
          error.message.includes('prisma') ||
          error.message.includes('Invalid')
        ) {
          errorMessage = `Database error: ${error.message}

This usually means the Prisma client needs to be regenerated. Run: yarn prisma generate`;
        }
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

// GET /generate-content/artefact/:artefactId/stream - Stream content generation using SSE
router.get(
  '/generate-content/artefact/:artefactId/stream',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const actor = await enforceAdminActionGuards({
      req,
      res,
      requireSignup: true,
      usage: {
        globalIncrements: { llmCalls: 1, dbOps: 1 },
        userIncrements: { llmCalls: 1 },
      },
    });
    if (!actor) {
      return;
    }

    const artefactId = parseRequiredNumber(
      req.params.artefactId,
      'Invalid artefactId'
    );

    const context = await fetchArtifactContext(artefactId);
    if (!context) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const providerName = parseProvider(req.query.provider, 'google');
    const ttsProvider = parseTtsProvider(
      req.query.ttsProvider,
      getDefaultTtsProvider()
    );

    const sse = createSseWriter(res);

    try {
      sse.sendEvent('status', {
        step: 'loading',
        message: 'Loading artifact data...',
      });

      sse.sendEvent('status', {
        step: 'generating',
        message: `Sending prompt to ${providerName === 'google' ? 'Google' : 'OpenAI'}...`,
      });

      await assertTextAllowedForLlm(context.template, 'introduction-stream');

      let fullText = '';
      let modelName = '';
      let inputTokens = 0;
      let outputTokens = 0;
      const streamStart = Date.now();

      if (providerName === 'google') {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
          sse.sendEvent('error', { error: 'GEMINI_API_KEY not configured' });
          sse.end();
          return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        modelName = 'gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContentStream(context.template);

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullText += chunkText;
          sse.sendEvent('chunk', { text: chunkText });
        }

        const finalResponse = await result.response;
        const usage = finalResponse.usageMetadata;
        inputTokens = usage?.promptTokenCount ?? 0;
        outputTokens = usage?.candidatesTokenCount ?? 0;

        recordApiCall({
          service: 'Gemini',
          endpoint: 'generateContentStream',
          durationMs: Date.now() - streamStart,
          status: 'success',
          inputTokens,
          outputTokens,
          model: modelName,
        });
      } else {
        const apiKey = env.OPENAI_API_KEY;
        if (!apiKey) {
          sse.sendEvent('error', { error: 'OPENAI_API_KEY not configured' });
          sse.end();
          return;
        }

        const client = new OpenAI({ apiKey });
        modelName = env.OPENAI_MODEL_INTRODUCTION || 'gpt-5-nano';

        const stream = client.responses.stream({
          model: modelName,
          input: [{ role: 'user', content: context.template }],
          max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
          reasoning: { effort: 'minimal' },
        });

        stream.on('response.output_text.delta', (event) => {
          const delta = typeof event?.delta === 'string' ? event.delta : '';
          if (!delta) return;
          fullText += delta;
          sse.sendEvent('chunk', { text: delta });
        });

        await stream.done();
        const finalResponse = await stream.finalResponse();
        const usage = finalResponse.usage;
        inputTokens = usage?.input_tokens ?? 0;
        outputTokens = usage?.output_tokens ?? 0;

        recordApiCall({
          service: 'OpenAI',
          endpoint: 'responses.stream',
          durationMs: Date.now() - streamStart,
          status: 'success',
          inputTokens,
          outputTokens,
          model: modelName,
        });
      }

      await recordUsage({
        provider: providerName,
        model: modelName,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - streamStart,
        apiCallId: null,
        artifactId: artefactId,
      });

      sse.sendEvent('status', { step: 'saving', message: 'Saving content...' });

      const content = await prisma.content.create({
        data: {
          text: fullText,
          type: 'introduction',
          artifactId: artefactId,
          llmProvider: providerName,
          model: modelName,
          prompt: context.template,
          isAdultContent: false,
          sensitiveTopics: [],
          subjectTags: [],
          suggestedQuestions: [],
        },
      });

      sse.sendEvent('status', {
        step: 'audio',
        message: 'Generating audio with text-to-speech...',
      });

      const { errorMessage: audioErrorMessage } =
        await withOptionalAudioGeneration({
          logLabel: '[generate-content.stream] Audio generation failed',
          logContext: {
            artifactId: artefactId,
            contentId: content.id,
            ttsProvider,
          },
          generate: () =>
            generateAudioForContent(content.id, fullText, {
              provider: ttsProvider,
            }),
          persist: async (audioUrl) => {
            await prisma.content.update({
              where: { id: content.id },
              data: { audioUrl },
            });
          },
        });

      const finalContent = await prisma.content.findUnique({
        where: { id: content.id },
      });

      sse.sendEvent('complete', {
        content: finalContent,
        audioError: audioErrorMessage,
      });
      sse.end();
    } catch (error) {
      sse.sendEvent('error', {
        error:
          error instanceof Error ? error.message : 'Failed to generate content',
      });
      sse.end();
    }
  }
);

// GET /wikipedia/summary - Fetch Wikipedia summary for a given URL (with English preference and translation)
router.get('/wikipedia/summary', async (req, res) => {
  try {
    const limitsAllowed = await enforceUsageLimits({
      res,
      actor: req.actor,
      globalIncrements: { wikiCalls: 1 },
      userIncrements: req.actor ? { wikiCalls: 1 } : undefined,
    });
    if (!limitsAllowed) {
      return;
    }

    const { url } = parseWithSchema(
      wikipediaSummaryQuerySchema,
      req.query,
      'URL is required'
    );

    // Use the version that prefers English and translates if needed
    const summary = await fetchWikipediaSummaryWithTranslation(url);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    res.json(summary);
  } catch (error) {
    if (createHttpError.isHttpError(error)) {
      throw error;
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch summary',
    });
  }
});

// POST /generate-audio/artefact/:artefactId - Generate audio for artifact's content
router.post(
  '/generate-audio/artefact/:artefactId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const artefactId = parseRequiredNumber(
        req.params.artefactId,
        'Invalid artefactId'
      );

      const content = await prisma.content.findFirst({
        where: { artifactId: artefactId },
        orderBy: { createdAt: 'desc' },
      });

      if (!content) {
        return res
          .status(404)
          .json({ error: 'No content found for this artifact' });
      }

      if (!content.text) {
        return res
          .status(400)
          .json({ error: 'Content has no text to generate audio from' });
      }

      const { ttsProvider: ttsProviderInput } = parseWithSchema(
        ttsProviderBodySchema,
        req.body
      );
      const audioUrl = await generateAudioForContent(content.id, content.text, {
        provider: parseTtsProvider(ttsProviderInput, getDefaultTtsProvider()),
      });

      const updatedContent = await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });

      res.json(updatedContent);
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      let errorMessage = 'Failed to generate audio';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

// POST /generate-audio/content/:contentId - Generate audio for a specific content item
router.post(
  '/generate-audio/content/:contentId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const contentId = parseRequiredNumber(
        req.params.contentId,
        'Invalid contentId'
      );

      const content = await prisma.content.findUnique({
        where: { id: contentId },
      });

      if (!content) {
        return res.status(404).json({ error: 'Content not found' });
      }

      if (!content.text) {
        return res
          .status(400)
          .json({ error: 'Content has no text to generate audio from' });
      }

      const { ttsProvider: ttsProviderInput } = parseWithSchema(
        ttsProviderBodySchema,
        req.body
      );
      const audioUrl = await generateAudioForContent(content.id, content.text, {
        provider: parseTtsProvider(ttsProviderInput, getDefaultTtsProvider()),
      });

      const updatedContent = await prisma.content.update({
        where: { id: content.id },
        data: { audioUrl },
      });

      res.json(updatedContent);
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      let errorMessage = 'Failed to generate audio';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);
