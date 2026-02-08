/**
 * Wikidata Query Service utilities
 */

import { TranslationServiceClient } from '@google-cloud/translate';

export { buildMuseumQuery, buildArtifactsQuery } from './sparql-queries';

const WIKIDATA_QUERY_SERVICE_URL = 'https://query.wikidata.org/sparql';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';

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
export async function queryWikidata<T = WikidataBinding>(sparqlQuery: string): Promise<T[]> {
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

// ============================================================================
// WIKIDATA SEARCH API (wbsearchentities) - Fast name search
// ============================================================================

export interface WikidataSearchResult {
  qid: string;
  label: string;
  description?: string;
}

/**
 * Search Wikidata for entities by name using the wbsearchentities API.
 * This is faster than SPARQL and designed for autocomplete/search.
 */
export async function searchWikidata(
  query: string,
  limit: number = 10
): Promise<WikidataSearchResult[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: query,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: String(limit),
    format: 'json',
    origin: '*',
  });

  const url = `${WIKIDATA_API_URL}?${params}`;
  console.log(`[Wikidata Search] Searching for: "${query}"`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MuseumGuide/1.0 (museum-guide@example.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata search failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.search || !Array.isArray(data.search)) {
    return [];
  }

  // Keywords that indicate a museum-like entity
  const museumKeywords = ['museum', 'gallery', 'collection', 'exhibition', 'art center', 'art centre'];

  // Keywords that indicate non-museum entities (articles, publications, etc.)
  const excludeKeywords = [
    'article',
    'journal',
    'publication',
    'book',
    'paper',
    'magazine',
    'newspaper',
    'periodical',
    'dissertation',
    'thesis',
    'scholarly',
    'scientific article',
    'academic',
    'wikimedia',
    'wikipedia',
    'category',
    'template',
    'taxon',
    'species',
    'genus',
    'song',
    'album',
    'film',
    'movie',
    'television',
    'tv series',
    'video game',
  ];

  const results: WikidataSearchResult[] = data.search
    .map((item: { id: string; label: string; description?: string }) => ({
      qid: item.id,
      label: item.label,
      description: item.description,
    }))
    .filter((item: WikidataSearchResult) => {
      const desc = (item.description || '').toLowerCase();
      const label = item.label.toLowerCase();

      // Exclude if description matches any exclude keywords
      if (excludeKeywords.some(keyword => desc.includes(keyword))) {
        return false;
      }

      // Include if label or description contains museum-related keywords
      const hasMuseumKeyword =
        museumKeywords.some(keyword => label.includes(keyword)) ||
        museumKeywords.some(keyword => desc.includes(keyword));

      return hasMuseumKeyword;
    });

  console.log(`[Wikidata Search] Found ${results.length} museum-like results`);
  return results;
}

// ============================================================================
// WIKIDATA ENTITY FETCH (wbgetentities) - Full details by QID
// ============================================================================

export interface WikidataMuseumDetails {
  qid: string;
  label: string;
  description?: string;
  wikipediaUrl?: string;
  image?: string;
  coordinates?: { lat: number; lng: number };
  officialWebsite?: string;
  locationLabels: string[];
}

// Wikidata property IDs
const PROPS = {
  INSTANCE_OF: 'P31',
  IMAGE: 'P18',
  COORDINATES: 'P625',
  OFFICIAL_WEBSITE: 'P856',
  LOCATED_IN: 'P131',
};

// Q IDs for museum types
const MUSEUM_TYPES = [
  'Q33506',   // museum
  'Q207694',  // art museum
  'Q17431399', // science museum
  'Q16735822', // history museum
  'Q1970365',  // natural history museum
  'Q7328910',  // archaeological museum
];

/**
 * Fetch full details for a Wikidata entity by QID.
 * Returns museum details including wikipedia URL, image, coordinates, etc.
 */
export async function fetchWikidataEntity(
  qid: string
): Promise<WikidataMuseumDetails | null> {
  // Validate QID format
  if (!/^Q\d+$/.test(qid)) {
    throw new Error(`Invalid QID format: ${qid}`);
  }

  const params = new URLSearchParams({
    action: 'wbgetentities',
    ids: qid,
    languages: 'en|de',
    props: 'labels|descriptions|claims|sitelinks',
    format: 'json',
    origin: '*',
  });

  const url = `${WIKIDATA_API_URL}?${params}`;
  console.log(`[Wikidata Entity] Fetching: ${qid}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MuseumGuide/1.0 (museum-guide@example.com)',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata entity fetch failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.entities || !data.entities[qid]) {
    console.warn(`[Wikidata Entity] Entity not found: ${qid}`);
    return null;
  }

  const entity = data.entities[qid];
  const claims = entity.claims || {};
  const sitelinks = entity.sitelinks || {};

  // Get label (prefer English, fallback to German)
  const label =
    entity.labels?.en?.value ||
    entity.labels?.de?.value ||
    qid;

  // Get description
  const description =
    entity.descriptions?.en?.value ||
    entity.descriptions?.de?.value;

  // Get Wikipedia URL (prefer English, fallback to German)
  let wikipediaUrl: string | undefined;
  if (sitelinks.enwiki) {
    wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(sitelinks.enwiki.title.replace(/ /g, '_'))}`;
  } else if (sitelinks.dewiki) {
    wikipediaUrl = `https://de.wikipedia.org/wiki/${encodeURIComponent(sitelinks.dewiki.title.replace(/ /g, '_'))}`;
  }

  // Get image (P18)
  let image: string | undefined;
  if (claims[PROPS.IMAGE]?.[0]?.mainsnak?.datavalue?.value) {
    const filename = claims[PROPS.IMAGE][0].mainsnak.datavalue.value;
    image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
  }

  // Get coordinates (P625)
  let coordinates: { lat: number; lng: number } | undefined;
  if (claims[PROPS.COORDINATES]?.[0]?.mainsnak?.datavalue?.value) {
    const coord = claims[PROPS.COORDINATES][0].mainsnak.datavalue.value;
    coordinates = {
      lat: coord.latitude,
      lng: coord.longitude,
    };
  }

  // Get official website (P856)
  let officialWebsite: string | undefined;
  if (claims[PROPS.OFFICIAL_WEBSITE]?.[0]?.mainsnak?.datavalue?.value) {
    officialWebsite = claims[PROPS.OFFICIAL_WEBSITE][0].mainsnak.datavalue.value;
  }

  // Get location labels (P131) - we'd need additional fetches for these
  // For now, just collect the QIDs; we can resolve them later if needed
  const locationLabels: string[] = [];

  console.log(`[Wikidata Entity] Fetched: ${label} (${qid})`);

  return {
    qid,
    label,
    description,
    wikipediaUrl,
    image,
    coordinates,
    officialWebsite,
    locationLabels,
  };
}

/**
 * Validate that an entity is a museum (has instance-of museum or subclass)
 */
export async function isMuseum(qid: string): Promise<boolean> {
  const details = await fetchWikidataEntity(qid);
  if (!details) return false;

  // For now, we trust the search filtering
  // A more robust check would verify P31 (instance-of) claims
  return true;
}

// ============================================================================
// WIKIPEDIA SUMMARY API
// ============================================================================

export interface WikipediaSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  translated?: boolean;
  originalLanguage?: string;
  originalExtract?: string;
}

/**
 * Fetch a summary from Wikipedia REST API.
 * Works with both English and German Wikipedia URLs.
 *
 * @param wikipediaUrl - Full Wikipedia URL (e.g., https://en.wikipedia.org/wiki/Altes_Museum)
 */
export async function fetchWikipediaSummary(
  wikipediaUrl: string
): Promise<WikipediaSummary | null> {
  try {
    // Parse the Wikipedia URL to extract language and title
    const url = new URL(wikipediaUrl);
    const lang = url.hostname.split('.')[0]; // 'en' or 'de'
    const title = decodeURIComponent(url.pathname.replace('/wiki/', ''));

    if (!lang || !title) {
      console.warn('[Wikipedia] Could not parse URL:', wikipediaUrl);
      return null;
    }

    // Use Wikipedia REST API summary endpoint
    const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    console.log(`[Wikipedia] Fetching summary: ${title} (${lang})`);

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'MuseumGuide/1.0 (museum-guide@example.com)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[Wikipedia] Summary fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    return {
      title: data.title,
      extract: data.extract || '',
      description: data.description,
      thumbnail: data.thumbnail,
    };
  } catch (error) {
    console.error('[Wikipedia] Error fetching summary:', error);
    return null;
  }
}

/**
 * Translate text using Google Cloud Translation API
 * Uses the same authentication as Text-to-Speech (GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
 */
async function translateText(
  text: string,
  targetLang: string = 'en'
): Promise<string | null> {
  try {
    // Initialize Google Cloud Translation client
    // Uses GOOGLE_APPLICATION_CREDENTIALS env var or default application credentials
    const client = new TranslationServiceClient();

    // Get the project ID from environment or use a default
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

    if (!projectId) {
      console.warn('[Translation] GOOGLE_CLOUD_PROJECT not configured');
      return null;
    }

    const location = 'global';
    const parent = `projects/${projectId}/locations/${location}`;

    console.log('[Translation] Translating text...', {
      textLength: text.length,
      targetLang,
      projectId,
    });

    const [response] = await client.translateText({
      parent,
      contents: [text],
      targetLanguageCode: targetLang,
      mimeType: 'text/plain',
    });

    const translatedText = response.translations?.[0]?.translatedText;

    if (translatedText) {
      console.log('[Translation] Translation successful', {
        originalLength: text.length,
        translatedLength: translatedText.length,
      });
      return translatedText;
    }

    console.warn('[Translation] No translation returned');
    return null;
  } catch (error) {
    console.error('[Translation] Error:', error);

    // Provide helpful error messages for common credential issues
    if (error instanceof Error) {
      if (
        error.message.includes('Could not load the default credentials') ||
        error.message.includes('authentication') ||
        error.message.includes('credentials')
      ) {
        console.error(
          '[Translation] Authentication failed. Make sure you have authenticated with:\n' +
            '  gcloud auth application-default login\n' +
            'Or set GOOGLE_APPLICATION_CREDENTIALS to your service account key file path.'
        );
      }
    }

    return null;
  }
}

/**
 * Get English Wikipedia URL from a non-English Wikipedia URL via Wikidata
 */
async function getEnglishWikipediaUrl(
  wikipediaUrl: string
): Promise<string | null> {
  try {
    const url = new URL(wikipediaUrl);
    const lang = url.hostname.split('.')[0];

    // Already English
    if (lang === 'en') {
      return wikipediaUrl;
    }

    const title = decodeURIComponent(url.pathname.replace('/wiki/', ''));

    // Use Wikipedia API to get Wikidata item
    const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&format=json&origin=*`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'MuseumGuide/1.0 (museum-guide@example.com)',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const pages = data.query?.pages;
    const pageId = Object.keys(pages || {})[0];
    const wikidataId = pages?.[pageId]?.pageprops?.wikibase_item;

    if (!wikidataId) return null;

    // Now fetch Wikidata entity to get English sitelink
    const wdResponse = await fetch(
      `${WIKIDATA_API_URL}?action=wbgetentities&ids=${wikidataId}&props=sitelinks&format=json&origin=*`,
      {
        headers: {
          'User-Agent': 'MuseumGuide/1.0 (museum-guide@example.com)',
        },
      }
    );

    if (!wdResponse.ok) return null;

    const wdData = await wdResponse.json();
    const englishTitle = wdData.entities?.[wikidataId]?.sitelinks?.enwiki?.title;

    if (englishTitle) {
      return `https://en.wikipedia.org/wiki/${encodeURIComponent(englishTitle.replace(/ /g, '_'))}`;
    }

    return null;
  } catch (error) {
    console.error('[Wikipedia] Error getting English URL:', error);
    return null;
  }
}

/**
 * Fetch Wikipedia summary, preferring English, with translation fallback
 */
// Map language codes to display names
const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  pl: 'Polish',
  sv: 'Swedish',
  uk: 'Ukrainian',
};

export async function fetchWikipediaSummaryWithTranslation(
  wikipediaUrl: string
): Promise<WikipediaSummary | null> {
  try {
    const url = new URL(wikipediaUrl);
    const originalLang = url.hostname.split('.')[0];

    // If not English, try to find English version first
    if (originalLang !== 'en') {
      console.log(`[Wikipedia] Original URL is ${originalLang}, looking for English version...`);
      const englishUrl = await getEnglishWikipediaUrl(wikipediaUrl);

      if (englishUrl) {
        console.log('[Wikipedia] Found English version, fetching...');
        const englishSummary = await fetchWikipediaSummary(englishUrl);
        if (englishSummary) {
          return englishSummary;
        }
      }
    }

    // Fetch original language summary
    console.log(`[Wikipedia] Fetching ${originalLang} summary...`);
    const summary = await fetchWikipediaSummary(wikipediaUrl);

    if (!summary) {
      return null;
    }

    // If already English, return as-is
    if (originalLang === 'en') {
      return summary;
    }

    // Translate if not English
    console.log(`[Wikipedia] Translating ${originalLang} summary to English...`);
    const originalExtract = summary.extract;
    const translatedExtract = await translateText(summary.extract, 'en');

    if (translatedExtract) {
      return {
        ...summary,
        extract: translatedExtract,
        translated: true,
        originalLanguage: LANGUAGE_NAMES[originalLang] || originalLang.toUpperCase(),
        originalExtract: originalExtract,
      };
    }

    // Return original if translation fails (better than nothing)
    console.log('[Wikipedia] Translation failed, returning original');
    return {
      ...summary,
      originalLanguage: LANGUAGE_NAMES[originalLang] || originalLang.toUpperCase(),
    };
  } catch (error) {
    console.error('[Wikipedia] Error in fetchWikipediaSummaryWithTranslation:', error);
    return null;
  }
}

// ============================================================================
// ARTIFACT QUERY RESULTS
// ============================================================================

export interface WikidataArtifactBinding {
  item?: { value: string };
  itemLabel?: { value: string };
  itemDescription?: { value: string };
  image?: { value: string };
  article?: { value: string };
}

export interface ArtifactFromWikidata {
  qid: string;
  label: string;
  description?: string;
  image?: string;
  wikipediaUrl?: string;
}

/**
 * Parse artifact query results from Wikidata SPARQL
 */
export function parseArtifactResults(
  bindings: WikidataArtifactBinding[]
): ArtifactFromWikidata[] {
  const seen = new Set<string>();
  const results: ArtifactFromWikidata[] = [];

  for (const binding of bindings) {
    const itemUri = binding.item?.value;
    if (!itemUri) continue;

    const qid = extractQId(itemUri);
    if (!qid || seen.has(qid)) continue;
    seen.add(qid);

    const label = binding.itemLabel?.value;
    if (!label || label === qid) continue; // Skip items without proper labels

    // Get Wikipedia URL - prefer English
    let wikipediaUrl = binding.article?.value;
    if (wikipediaUrl && !wikipediaUrl.includes('en.wikipedia.org')) {
      // Keep German as fallback
    }

    // Get image URL (convert to Commons file path if needed)
    let image = binding.image?.value;
    if (image && !image.startsWith('http')) {
      image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}`;
    }

    results.push({
      qid,
      label,
      description: binding.itemDescription?.value,
      image,
      wikipediaUrl,
    });
  }

  return results;
}
