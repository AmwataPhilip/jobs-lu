import { annualizeSalary } from './salary';

// Shared Schema.org JobPosting JSON-LD extraction for sources that embed it
// on their own detail pages (verified live 2026-08-28 for Hays and Adecco —
// see docs/JOB_SOURCE_INGESTION_STRATEGY.md). Both sites' <script> tags carry
// extra attributes before `type=` (e.g. Hays' `id="jobPostingSchema"`), so
// the regex can't assume `type` is the first attribute.
export interface JobPostingJsonLd {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } };
  baseSalary?: {
    value?: {
      value?: string | number;
      minValue?: string | number;
      maxValue?: string | number;
      unitText?: string;
    };
  };
}

export function extractJobPostingJsonLd(html: string): JobPostingJsonLd | null {
  const matches = html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>(.+?)<\/script>/gs
  );
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.['@type'] === 'JobPosting') {
        return parsed as JobPostingJsonLd;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function parsePositiveNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Both Hays and Adecco's baseSalary fields are frequently placeholder/garbage
// values ("selon profil", "null", "0") rather than real numbers — verified on
// real listings, not a hypothetical edge case. Only return a number when the
// data is actually numeric and positive; every other case is legitimately
// "no salary disclosed", same as EURES/Jobfinder. The raw amount is then run
// through the same annualizeSalary() used for every other source (unitText
// maps directly to its intervalCode param), so estimatedSalary stays
// consistent Annual Gross EUR across all sources — see salary.ts.
export function parseJsonLdSalary(baseSalary?: JobPostingJsonLd['baseSalary']): number | null {
  if (!baseSalary?.value) return null;
  const direct = parsePositiveNumber(baseSalary.value.value);
  const min = parsePositiveNumber(baseSalary.value.minValue);
  const max = parsePositiveNumber(baseSalary.value.maxValue);
  const rawAmount = direct ?? (min && max ? (min + max) / 2 : (min ?? max));
  return annualizeSalary(rawAmount, baseSalary.value.unitText);
}

export function parseJsonLdDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
