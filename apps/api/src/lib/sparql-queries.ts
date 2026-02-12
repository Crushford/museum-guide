/**
 * SPARQL queries for Wikidata
 */

/**
 * Query for museums in a city, including those in districts within the city.
 * Uses P131* to follow the administrative chain upward (district -> city -> etc.)
 *
 * @param cityQId - The Wikidata QID for the city (e.g., "Q64" for Berlin)
 */
export function buildMuseumQuery(cityQId: string): string {
  return `# Museums in city (latency-optimized)
SELECT DISTINCT ?museum ?museumLabel WHERE {
  # wd:Q33506 = museum; include subclasses (art museum, science museum, etc.)
  ?museum wdt:P31/wdt:P279* wd:Q33506 .

  # Prefer shallow location paths for speed.
  # P131 = located in administrative territorial entity
  # P276 = location
  {
    ?museum wdt:P131 wd:${cityQId} .  # wd:${cityQId} = target city
  } UNION {
    ?museum wdt:P131/wdt:P131 wd:${cityQId} .  # wd:${cityQId} = target city
  } UNION {
    ?museum wdt:P276 wd:${cityQId} .  # wd:${cityQId} = target city
  }

  # P582 = end time (exclude defunct museums)
  FILTER NOT EXISTS { ?museum wdt:P582 ?endTime . }

  # label service: fetch human-readable names
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?museumLabel
LIMIT 300`;
}

/**
 * Query for artifacts/works associated with a museum that have Wikipedia pages.
 * Returns items with:
 * - P276 (location) = museum, OR
 * - P195 (collection) = museum, OR
 * - P127 (owned by) = museum
 *
 * Only returns items that have an English or German Wikipedia article.
 *
 * @param museumQId - The Wikidata QID for the museum (e.g., "Q700216" for Altes Museum)
 */
export function buildArtifactsQuery(museumQId: string): string {
  return `# Artifacts/works in a museum with Wikipedia pages
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?image ?article WHERE {
  # Find items related to the museum via location, collection, or ownership
  {
    ?item wdt:P276 wd:${museumQId} .  # wd:${museumQId} = target museum; P276 = location
  } UNION {
    ?item wdt:P195 wd:${museumQId} .  # wd:${museumQId} = target museum; P195 = collection
  } UNION {
    ?item wdt:P127 wd:${museumQId} .  # wd:${museumQId} = target museum; P127 = owned by
  }

  # Require a Wikipedia article (English or German)
  {
    ?article schema:about ?item ;
             schema:isPartOf <https://en.wikipedia.org/> .
  } UNION {
    ?article schema:about ?item ;
             schema:isPartOf <https://de.wikipedia.org/> .
  }

  # Optional: get image
  OPTIONAL { ?item wdt:P18 ?image . }

  # Get labels and descriptions
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de". }
}
ORDER BY ?itemLabel
LIMIT 200`;
}

/**
 * Query for museums near a latitude/longitude point.
 *
 * @param lat - Latitude in decimal degrees
 * @param lng - Longitude in decimal degrees
 * @param radiusKm - Search radius in kilometers
 * @param limit - Max number of results
 */
export function buildNearbyMuseumsQuery(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number
): string {
  return `# Museums near a coordinate (lat/lng)
SELECT DISTINCT ?museum ?museumLabel ?museumDescription ?distance ?location WHERE {
  # wd:Q33506 = museum; include subclasses
  ?museum wdt:P31/wdt:P279* wd:Q33506 .

  # Geospatial search around a center point
  SERVICE wikibase:around {
    ?museum wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?distance .
  }

  # P582 = end time (exclude defunct museums)
  FILTER NOT EXISTS { ?museum wdt:P582 ?endTime . }

  # Labels/descriptions in English first
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,de". }
}
ORDER BY ?distance
LIMIT ${limit}`;
}
