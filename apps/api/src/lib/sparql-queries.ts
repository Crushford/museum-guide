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
  return `# Museums in city (including districts)
SELECT DISTINCT ?museum ?museumLabel WHERE {
  # wd:Q33506 = museum
  ?museum wdt:P31 wd:Q33506 .

  # P131 = located in administrative territorial entity
  # P131* = follow the chain upward (district -> city -> country...)
  ?museum wdt:P131/wdt:P131* wd:${cityQId} .

  # P582 = end time (exclude defunct museums)
  FILTER NOT EXISTS { ?museum wdt:P582 ?endTime . }

  # label service: fetch human-readable names
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". }
}
ORDER BY ?museumLabel
LIMIT 5000`;
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
    ?item wdt:P276 wd:${museumQId} .  # P276 = location
  } UNION {
    ?item wdt:P195 wd:${museumQId} .  # P195 = collection
  } UNION {
    ?item wdt:P127 wd:${museumQId} .  # P127 = owned by
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
