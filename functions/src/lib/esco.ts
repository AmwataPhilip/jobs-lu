import { logger } from 'firebase-functions/v2';

const ESCO_SEARCH_URL = 'https://ec.europa.eu/esco/api/search';

interface EscoSearchResult {
  uri: string;
  title: string;
}

interface EscoSearchResponse {
  _embedded?: { results?: EscoSearchResult[] };
}

// In-memory cache, scoped to a single function invocation/container — ESCO
// has no public rate-limit docs, but this avoids redundant lookups for
// common skill labels within one ingestion run.
const cache = new Map<string, string | null>();

// Resolves a free-text skill label to a real ESCO skill concept URI via the
// official public ESCO search API (no key required, verified live against
// https://ec.europa.eu/esco/api/search on 2026-08-27). Returns null rather
// than a fabricated URI if no confident match is found.
export async function lookupEscoSkillUri(
  label: string
): Promise<string | null> {
  const key = label.trim().toLowerCase();
  if (!key) {
    return null;
  }
  if (cache.has(key)) {
    return cache.get(key)!;
  }

  try {
    const url = `${ESCO_SEARCH_URL}?text=${encodeURIComponent(label)}&type=skill&language=en&limit=1`;
    const response = await fetch(url);
    if (!response.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await response.json()) as EscoSearchResponse;
    const uri = data._embedded?.results?.[0]?.uri ?? null;
    cache.set(key, uri);
    return uri;
  } catch (error) {
    logger.warn('ESCO lookup failed', { label, error: (error as Error).message });
    cache.set(key, null);
    return null;
  }
}

export async function lookupEscoSkillUris(
  labels: string[]
): Promise<string[]> {
  const uris = await Promise.all(labels.map(lookupEscoSkillUri));
  return uris.filter((uri): uri is string => uri !== null);
}
