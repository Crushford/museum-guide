import {
  ApiRequestError,
  emitApiError,
  errorMessageFromBody,
  extractErrorBody,
} from '@/lib/api-errors';

export const API_URL = process.env.NEXT_PUBLIC_API_URL!;

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
