export const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    let errorMessage = `API error: ${res.status}`;
    try {
      const errorBody = await res.json();
      if (errorBody.error) {
        errorMessage = `${errorMessage} - ${errorBody.error}`;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function apiPost<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    let errorMessage = `API error: ${res.status}`;
    try {
      const errorBody = await res.json();
      if (errorBody.error) {
        errorMessage = `${errorMessage} - ${errorBody.error}`;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

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
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }
  return response.json();
}
