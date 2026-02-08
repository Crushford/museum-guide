/**
 * Wikidata Query Service utilities
 */

export { buildMuseumQuery } from './sparql-queries';

const WIKIDATA_QUERY_SERVICE_URL = 'https://query.wikidata.org/sparql';

interface WikidataValue {
  value: string;
}

export interface WikidataBinding {
  museum?: WikidataValue;
  museumLabel?: WikidataValue;
}

const QUERY_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1 second
const RATE_LIMIT_RETRY_DELAY_MS = 10000; // 10 seconds for 429

/**
 * Supported cities configuration
 */
export const SUPPORTED_CITIES: Record<string, string> = {
  berlin: 'Q64',
  amsterdam: 'Q9899',
  brisbane: 'Q34932'
};

/**
 * Execute a SPARQL query against Wikidata Query Service with retry logic
 */
export async function queryWikidata(sparqlQuery: string): Promise<WikidataBinding[]> {
  const url = `${WIKIDATA_QUERY_SERVICE_URL}?query=${encodeURIComponent(
    sparqlQuery
  )}&format=json`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Wikidata] Query attempt ${attempt}/${MAX_RETRIES}...`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/sparql-results+json',
          'User-Agent':
            'MuseumGuide/1.0 (https://github.com/yourusername/museum-guide; museum-guide@example.com)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle rate limiting specifically
      if (response.status === 429) {
        throw new Error('RATE_LIMIT');
      }

      if (!response.ok) {
        throw new Error(
          `Wikidata query failed with status ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.results || !Array.isArray(data.results.bindings)) {
        throw new Error('Invalid response format from Wikidata');
      }

      console.log(`[Wikidata] Query successful, received ${data.results.bindings.length} results`);
      return data.results.bindings;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(`Unknown error: ${String(error)}`);

      // Don't retry on abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Wikidata query timed out after ${QUERY_TIMEOUT_MS}ms`);
      }

      // Handle rate limiting with longer backoff
      if (lastError?.message === 'RATE_LIMIT') {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Wikidata rate limit exceeded. Please wait before retrying.`
          );
        }
        // Longer backoff for rate limits
        await new Promise((resolve) =>
          setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS * attempt)
        );
        continue;
      }

      // If this is the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to query Wikidata after ${MAX_RETRIES} attempts: ${lastError.message}`
        );
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * attempt)
      );
    }
  }

  throw lastError || new Error('Failed to query Wikidata');
}

/**
 * Extract Q-id from Wikidata URI
 * Example: "http://www.wikidata.org/entity/Q123" -> "Q123"
 */
export function extractQId(uri: string): string | null {
  const match = uri.match(/\/Q(\d+)$/);
  return match ? `Q${match[1]}` : null;
}
