import {
  ApiRequestError,
  emitApiError,
  errorMessageFromBody,
  extractErrorBody,
} from '@/lib/api-errors';

const LOCAL_API_URL = 'http://localhost:3001';
const PRODUCTION_API_URL = 'https://api.museumguide.io';

function isLocalApiUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function deriveApiUrlFromBrowser(): string {
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return LOCAL_API_URL;
  }

  if (hostname === 'museumguide.io' || hostname === 'www.museumguide.io') {
    return PRODUCTION_API_URL;
  }

  const baseHost = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return `${protocol}//api.${baseHost}`;
}

function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const runningInProduction = process.env.NODE_ENV === 'production';

  if (typeof window !== 'undefined') {
    // If a production build accidentally bakes in localhost, derive from the
    // current browser host so the deployed site still talks to the deployed API.
    if (runningInProduction && isLocalApiUrl(configured)) {
      return deriveApiUrlFromBrowser();
    }

    if (configured) {
      return configured;
    }

    return deriveApiUrlFromBrowser();
  }

  if (configured && !(runningInProduction && isLocalApiUrl(configured))) {
    return configured;
  }

  return runningInProduction ? PRODUCTION_API_URL : LOCAL_API_URL;
}

export const API_URL = resolveApiUrl();

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json();
  }

  const payload = await response.json().catch(() => ({}));
  const body = extractErrorBody(payload);
  if (body?.code) {
    emitApiError(body);
  }

  throw new ApiRequestError({
    status: response.status,
    body,
    message: errorMessageFromBody(body, `API error: ${response.status}`),
  });
}

export async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
  });
  return parseApiResponse<T>(response);
}

export async function apiPost<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  return parseApiResponse<T>(response);
}

export async function apiMutate<T = unknown>(
  path: string,
  options: { method: string; body?: unknown }
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method,
    ...(options.body
      ? { headers: JSON_HEADERS, body: JSON.stringify(options.body) }
      : {}),
  });
  return parseApiResponse<T>(response);
}

export async function authedApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: authHeaders(token),
  });
  return parseApiResponse<T>(response);
}

export async function authedApiPost<T>(
  path: string,
  token: string
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      ...authHeaders(token),
    },
    cache: 'no-store',
  });
  return parseApiResponse<T>(response);
}

export async function authedApiMutate<T = unknown>(
  path: string,
  options: { method: string; body?: unknown },
  token: string
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method,
    headers: {
      ...(options.body ? JSON_HEADERS : {}),
      ...authHeaders(token),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return parseApiResponse<T>(response);
}
