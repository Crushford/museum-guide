const API_URL = process.env.NEXT_PUBLIC_API_URL!;

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
