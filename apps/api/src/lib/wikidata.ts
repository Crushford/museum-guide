/**
 * Wikidata Query Service utilities
 */

const WIKIDATA_QUERY_SERVICE_URL = 'https://query.wikidata.org/sparql';

interface WikidataValue {
  value: string;
}

export interface WikidataBinding {
  museum?: WikidataValue;
  museumLabel?: WikidataValue;
  coord?: WikidataValue;
  image?: WikidataValue;
  wikipedia?: WikidataValue;
  locationLabels?: WikidataValue;
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
 * Build SPARQL query for museums in a city
 */
export function buildMuseumQuery(cityQId: string): string {
  return `#title: Museums (one row per museum, requires Wikipedia page, one image)
SELECT
  ?museum
  ?museumLabel
  (SAMPLE(?coord) AS ?coord)
  (SAMPLE(?image) AS ?image)
  (SAMPLE(?wikipedia) AS ?wikipedia)
  (GROUP_CONCAT(DISTINCT ?locLabel; SEPARATOR="|") AS ?locationLabels)
WHERE {
  ?museum wdt:P31/wdt:P279* wd:Q33506 .
  ?museum wdt:P131 wd:${cityQId} .
  FILTER NOT EXISTS { ?museum wdt:P582 ?endTime . }

  OPTIONAL { ?museum wdt:P625 ?coord . }
  OPTIONAL { ?museum wdt:P18  ?image . }

  OPTIONAL {
    ?enwiki schema:about ?museum ;
      schema:isPartOf <https://en.wikipedia.org/> .
  }
  OPTIONAL {
    ?dewiki schema:about ?museum ;
      schema:isPartOf <https://de.wikipedia.org/> .
  }
  BIND(COALESCE(?enwiki, ?dewiki) AS ?wikipedia)
  FILTER(BOUND(?wikipedia))

  OPTIONAL {
    ?museum wdt:P131 ?loc .
    OPTIONAL { ?loc rdfs:label ?locLabelDe . FILTER(LANG(?locLabelDe) = "de") }
    OPTIONAL { ?loc rdfs:label ?locLabelEn . FILTER(LANG(?locLabelEn) = "en") }
    BIND(COALESCE(?locLabelDe, ?locLabelEn) AS ?locLabel)
  }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "de,en".
  }
}
GROUP BY ?museum ?museumLabel
ORDER BY ?museumLabel
LIMIT 200`;
}

/**
 * Extract Q-id from Wikidata URI
 * Example: "http://www.wikidata.org/entity/Q123" -> "Q123"
 */
export function extractQId(uri: string): string | null {
  const match = uri.match(/\/Q(\d+)$/);
  return match ? `Q${match[1]}` : null;
}

/**
 * Parse coordinates from Wikidata Point format
 * Example: "Point(13.4050 52.5200)" -> { lat: 52.5200, lng: 13.4050 }
 * Supports negative coordinates: "Point(-74.0060 40.7128)"
 */
export function parseCoordinates(coordStr: string | undefined): {
  lat: number;
  lng: number;
} | null {
  if (!coordStr) return null;

  const match = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!match) return null;

  const lng = parseFloat(match[1]);
  const lat = parseFloat(match[2]);

  if (isNaN(lat) || isNaN(lng)) return null;

  return { lat, lng };
}

/**
 * Parse location labels string into array
 */
export function parseLocationLabels(
  locationLabelsStr: string | undefined
): string[] {
  if (!locationLabelsStr) return [];

  return locationLabelsStr
    .split('|')
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .filter((value, index, self) => self.indexOf(value) === index); // deduplicate
}
