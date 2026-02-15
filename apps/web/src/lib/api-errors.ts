export type ApiErrorCode =
  | 'LIMIT_GLOBAL_DAILY'
  | 'LIMIT_USER_DAILY'
  | 'SIGNUP_WAITLIST'
  | 'AUTH_REQUIRED';

export type UsageSnapshot = {
  user: {
    llmCalls: number;
    wikiCalls: number;
    museumCreates: number;
    artifactCreates: number;
  };
  limits: {
    llmCalls: number | null;
    wikiCalls: number | null;
    museumCreates: number | null;
    artifactCreates: number | null;
  };
};

export type StructuredApiErrorBody = {
  code?: ApiErrorCode | string;
  message?: string;
  resetAt?: string;
  usage?: UsageSnapshot;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body?: StructuredApiErrorBody;

  constructor(params: { status: number; message: string; body?: StructuredApiErrorBody }) {
    super(params.message);
    this.name = 'ApiRequestError';
    this.status = params.status;
    this.body = params.body;
  }
}

const API_ERROR_EVENT = 'museum-guide:api-error';

export function emitApiError(body: StructuredApiErrorBody) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<StructuredApiErrorBody>(API_ERROR_EVENT, { detail: body })
  );
}

export function apiErrorEventName() {
  return API_ERROR_EVENT;
}

export function extractErrorBody(payload: unknown): StructuredApiErrorBody | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const object = payload as Record<string, unknown>;
  const rawError = object.error;
  if (!rawError) {
    return undefined;
  }

  if (typeof rawError === 'string') {
    return { message: rawError };
  }

  if (typeof rawError === 'object') {
    const err = rawError as Record<string, unknown>;
    return {
      code: typeof err.code === 'string' ? err.code : undefined,
      message: typeof err.message === 'string' ? err.message : undefined,
      resetAt: typeof err.resetAt === 'string' ? err.resetAt : undefined,
      usage: err.usage as UsageSnapshot | undefined,
    };
  }

  return undefined;
}

export function errorMessageFromBody(
  body: StructuredApiErrorBody | undefined,
  fallback: string
): string {
  if (body?.message) {
    return body.message;
  }
  return fallback;
}
