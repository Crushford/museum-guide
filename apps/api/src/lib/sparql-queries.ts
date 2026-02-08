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
