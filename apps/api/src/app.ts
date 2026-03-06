import { env, parseCsvEnv } from './config/env';
import { API_JSON_BODY_LIMIT_BYTES } from './config/constants';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import createHttpError from 'http-errors';
import { prisma } from '@repo/db';
import { recordApiCall } from './lib/telemetry/api-call-tracker';
import {
  authVerificationRateLimit,
  attachActorIfPresent,
} from './middleware/auth';
import { httpLogger } from './middleware/http-logger';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { initLangfuse } from './lib/telemetry/langfuse';
import { router as authRouter } from './modules/auth/router';
import {
  apiRouter as museumsApiRouter,
  router as museumsRouter,
} from './modules/museums/router';
import { router as roomsRouter } from './modules/rooms/router';
import { router as artifactsRouter } from './modules/artifacts/router';
import { router as scanRouter } from './modules/scan/router';
import { router as questionsRouter } from './modules/questions/router';
import { router as contentRouter } from './modules/content/router';
import { router as adminRouter } from './modules/admin/router';

const ENABLE_DB_QUERY_BILLING_LOGS = env.DB_QUERY_BILLING_LOGS;
const TRUST_PROXY_HOPS = env.TRUST_PROXY_HOPS;

const allowedCorsOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://museumguide.io',
  'https://www.museumguide.io',
  ...parseCsvEnv(env.FRONTEND_URL),
  ...parseCsvEnv(env.FRONTEND_URLS),
]);

const app = express();

if (Number.isFinite(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', TRUST_PROXY_HOPS);
}

app.use(httpLogger);

// Security headers. Allow cross-origin resource usage so the web app
// (different origin in local dev/prod) can continue loading /audio and /uploads.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Enable CORS for all routes
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(createHttpError(403, `CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);

// Compress JSON/text responses, but skip preflights, streaming endpoints,
// and already-compressed/static media routes.
app.use(
  compression({
    filter: (req, res) => {
      if (req.method === 'OPTIONS') {
        return false;
      }

      const path = req.path || '';
      if (
        path === '/audio' ||
        path.startsWith('/audio/') ||
        path === '/uploads' ||
        path.startsWith('/uploads/')
      ) {
        return false;
      }

      if (path.endsWith('/stream')) {
        return false;
      }

      const accept = req.headers.accept;
      if (typeof accept === 'string' && accept.includes('text/event-stream')) {
        return false;
      }

      return compression.filter(req, res);
    },
  })
);

app.use(express.json({ limit: API_JSON_BODY_LIMIT_BYTES }));
app.use(authVerificationRateLimit);
app.use(attachActorIfPresent);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const path = req.path;
    if (path.startsWith('/admin/api-calls')) {
      return;
    }

    recordApiCall({
      service: 'API',
      endpoint: `${req.method} ${path}`,
      durationMs: Date.now() - startedAt,
      status: res.statusCode >= 400 ? 'error' : 'success',
      statusCode: res.statusCode,
      metadata: {
        userUid: req.actor?.uid ?? null,
        isAdmin: req.actor?.isAdmin ?? null,
        usageDelta:
          (res.locals as { usageDelta?: Record<string, number> }).usageDelta ??
          null,
      },
    });
  });

  next();
});

// Serve static audio files
const audioDir = resolve(__dirname, '../public/audio');
if (!existsSync(audioDir)) {
  mkdir(audioDir, { recursive: true }).catch(() => {});
}
app.use('/audio', express.static(audioDir));

const uploadsDir = resolve(__dirname, '../public/uploads');
if (!existsSync(uploadsDir)) {
  mkdir(uploadsDir, { recursive: true }).catch(() => {});
}
app.use('/uploads', express.static(uploadsDir));

function shouldLogDbQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  if (normalized.includes('"apicall"')) return false;
  if (normalized.includes('_prisma_migrations')) return false;
  return true;
}

if (ENABLE_DB_QUERY_BILLING_LOGS) {
  (prisma as any).$on('query', (event: any) => {
    const query = typeof event?.query === 'string' ? event.query : '';
    if (!query || !shouldLogDbQuery(query)) {
      return;
    }

    const firstWord = query.trim().split(/\s+/)[0]?.toUpperCase() || 'QUERY';
    const target = typeof event?.target === 'string' ? event.target : 'prisma';
    const durationMs = typeof event?.duration === 'number' ? event.duration : 0;

    recordApiCall({
      service: 'Database',
      endpoint: `prisma.${firstWord.toLowerCase()}`,
      durationMs,
      status: 'success',
      metadata: {
        target,
      },
    });
  });
}

// Route modules
app.use(authRouter);
app.use('/api/museums', museumsApiRouter);
app.use('/museums', museumsRouter);
app.use(roomsRouter);
app.use(artifactsRouter);
app.use(scanRouter);
app.use(questionsRouter);
app.use(contentRouter);
app.use('/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

initLangfuse();

export { app };
