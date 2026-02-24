import pino, { type LevelWithSilent } from 'pino';
import { env } from '../config/env';

const DEFAULT_LOG_LEVEL: LevelWithSilent = 'info';
const TEST_LOG_LEVEL: LevelWithSilent = 'silent';

export const isTestEnv = env.NODE_ENV === 'test' || env.VITEST;

function getLogLevel(): LevelWithSilent {
  const raw = env.LOG_LEVEL;
  const fallback = isTestEnv ? TEST_LOG_LEVEL : DEFAULT_LOG_LEVEL;

  if (!raw) {
    return fallback;
  }

  const allowed = new Set<LevelWithSilent>([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ]);

  return allowed.has(raw) ? raw : fallback;
}

export const logger = pino({
  level: getLogLevel(),
  redact: {
    paths: [
      'authorization',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});
