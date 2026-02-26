import { Router } from 'express';
import createHttpError from 'http-errors';
import { requireAuth, requireAdmin } from '../../middleware/auth';
import { prisma } from '@repo/db';
import {
  extractTextFromImage,
  parseOcrProvider,
  getDefaultOcrProvider,
  searchDuplicatesFromRawText,
  extractArtifactDraft,
  searchDuplicatesFromDraft,
  createArtifactAndAssets,
} from '../../lib/artifact-scan';
import {
  parseRequiredNumber,
  parseWithSchema,
} from '../../lib/http/validation';
import { enforceAdminActionGuards } from '../../http/route-helpers';
import {
  scanCreateBodySchema,
  scanDuplicatesDraftBodySchema,
  scanOcrBodySchema,
  scanRawTextBodySchema,
} from './schemas';

export const router = Router();

router.post(
  '/museums/:museumId/scan/ocr',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const actor = await enforceAdminActionGuards({
        req,
        res,
        requireSignup: true,
        plaqueScanLimit: true,
      });
      if (!actor) {
        return;
      }

      const museumId = parseRequiredNumber(
        req.params.museumId,
        'Invalid museumId'
      );
      const { imageBase64, provider } = parseWithSchema(
        scanOcrBodySchema,
        req.body
      );

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      const ocrProvider = parseOcrProvider(provider, getDefaultOcrProvider());

      const museum = await prisma.museum.findUnique({
        where: { id: museumId },
      });
      if (!museum) {
        return res.status(404).json({ error: 'Museum not found' });
      }

      const ocr = await extractTextFromImage(imageBase64, ocrProvider);
      if (!ocr.rawText.trim()) {
        return res.status(422).json({
          error:
            'Could not read text from plaque image. Try taking another photo.',
        });
      }

      res.json({
        museumId,
        rawText: ocr.rawText,
        ocr,
      });
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to read plaque text';
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/museums/:museumId/scan/duplicates-raw',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const museumId = parseRequiredNumber(
        req.params.museumId,
        'Invalid museumId'
      );
      const { rawText } = parseWithSchema(scanRawTextBodySchema, req.body);

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }

      const duplicates = await searchDuplicatesFromRawText(museumId, rawText);
      res.json(duplicates);
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to search duplicates';
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/museums/:museumId/scan/draft',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const museumId = parseRequiredNumber(
        req.params.museumId,
        'Invalid museumId'
      );
      const { rawText } = parseWithSchema(scanRawTextBodySchema, req.body);

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }

      const museum = await prisma.museum.findUnique({
        where: { id: museumId },
        select: { id: true, name: true },
      });
      if (!museum) {
        return res.status(404).json({ error: 'Museum not found' });
      }

      const draft = await extractArtifactDraft(rawText, museum.name);
      res.json({ draft });
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to extract artifact draft';
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/museums/:museumId/scan/duplicates-draft',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const museumId = parseRequiredNumber(
        req.params.museumId,
        'Invalid museumId'
      );
      const { draft } = parseWithSchema(
        scanDuplicatesDraftBodySchema,
        req.body,
        'draft is required'
      );

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }

      const duplicates = await searchDuplicatesFromDraft(museumId, {
        localTitle:
          typeof draft.localTitle === 'string' ? draft.localTitle : '',
        localTitleLanguage:
          typeof draft.localTitleLanguage === 'string'
            ? draft.localTitleLanguage
            : 'und',
        englishTitle:
          typeof draft.englishTitle === 'string' ? draft.englishTitle : '',
        knowledgeText:
          typeof draft.knowledgeText === 'string' ? draft.knowledgeText : '',
        museumConfidence:
          typeof draft.museumConfidence === 'number'
            ? draft.museumConfidence
            : 90,
      });
      res.json(duplicates);
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to search duplicates';
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/museums/:museumId/scan/create',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const actor = await enforceAdminActionGuards({
        req,
        res,
        requireSignup: true,
        usage: {
          globalIncrements: { artifactCreates: 1, dbOps: 1 },
          userIncrements: { artifactCreates: 1 },
        },
      });
      if (!actor) {
        return;
      }

      const museumId = parseRequiredNumber(
        req.params.museumId,
        'Invalid museumId'
      );
      const { imageBase64, rawText, draft, ocr, enrichment } = parseWithSchema(
        scanCreateBodySchema,
        req.body
      );

      if (!museumId) {
        return res.status(400).json({ error: 'Invalid museumId' });
      }
      const imageBase64Value =
        typeof imageBase64 === 'string' ? imageBase64 : '';
      const rawTextValue = typeof rawText === 'string' ? rawText : '';
      if (!imageBase64Value || !rawTextValue.trim() || !draft || !ocr) {
        const missing: string[] = [];
        if (!imageBase64Value) missing.push('imageBase64');
        if (!rawTextValue.trim()) missing.push('rawText');
        if (!draft) missing.push('draft');
        if (!ocr) missing.push('ocr');
        return res.status(400).json({
          error: `Invalid scan create payload. Missing: ${missing.join(', ')}.`,
        });
      }

      const created = await createArtifactAndAssets({
        museumId,
        imageBase64: imageBase64Value,
        plaqueText: rawTextValue,
        ocr: {
          rawText: rawTextValue,
          languageHints: Array.isArray(ocr.languageHints)
            ? ocr.languageHints
            : [],
          confidence:
            typeof ocr.confidence === 'number' ? ocr.confidence : null,
          blocks: Array.isArray(ocr.blocks) ? ocr.blocks : [],
          provider: parseOcrProvider(ocr.provider, getDefaultOcrProvider()),
        },
        draft: {
          localTitle:
            typeof draft.localTitle === 'string'
              ? draft.localTitle
              : 'Untitled artefact',
          localTitleLanguage:
            typeof draft.localTitleLanguage === 'string'
              ? draft.localTitleLanguage
              : 'und',
          englishTitle:
            typeof draft.englishTitle === 'string'
              ? draft.englishTitle
              : typeof draft.localTitle === 'string'
                ? draft.localTitle
                : 'Untitled artefact',
          knowledgeText:
            typeof draft.knowledgeText === 'string'
              ? draft.knowledgeText
              : 'An English description is not available yet for this artefact.',
          museumConfidence:
            typeof draft.museumConfidence === 'number'
              ? draft.museumConfidence
              : 90,
        },
        enrichment: {
          wikipediaUrl:
            typeof enrichment?.wikipediaUrl === 'string'
              ? enrichment.wikipediaUrl
              : null,
          wikipediaSummary:
            typeof enrichment?.wikipediaSummary === 'string'
              ? enrichment.wikipediaSummary
              : null,
          wikipediaSummaryLang:
            typeof enrichment?.wikipediaSummaryLang === 'string'
              ? enrichment.wikipediaSummaryLang
              : null,
          wikimediaImageUrl:
            typeof enrichment?.wikimediaImageUrl === 'string'
              ? enrichment.wikimediaImageUrl
              : null,
        },
      });

      res.json(created);
    } catch (error) {
      if (createHttpError.isHttpError(error)) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create artifact';
      res.status(500).json({ error: errorMessage });
    }
  }
);
