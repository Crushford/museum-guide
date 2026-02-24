import pino, { type LevelWithSilent } from 'pino';

const DEFAULT_LOG_LEVEL: LevelWithSilent = 'info';
const TEST_LOG_LEVEL: LevelWithSilent = 'silent';

export const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true' ||
  Boolean(process.env.VITEST);

function getLogLevel(): LevelWithSilent {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
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

  return allowed.has(raw as LevelWithSilent)
    ? (raw as LevelWithSilent)
    : fallback;
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
