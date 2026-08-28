// Cargolux and ArcelorMittal (both verified live 2026-08-28, see
// docs/JOB_SOURCE_INGESTION_STRATEGY.md) run on the same Oracle Recruiting
// Cloud / Fusion HCM platform with an identical, unauthenticated REST API —
// only the host and `siteNumber` tenant differ. One connector serves both,
// and should work for any other Oracle Recruiting Cloud employer found later
// (a well-documented, widely-used ATS).
//
// The `expand=requisitionList` query param is required — without it the API
// returns HTTP 200 with search metadata/facets but an empty requisition
// list, which looks like "zero jobs" rather than an error. Easy to miss.
export interface OracleRequisition {
  Id: string;
  Title: string;
  PostedDate: string | null;
  PrimaryLocation: string | null;
  PrimaryLocationCountry: string | null;
  ShortDescriptionStr: string | null;
}

export interface OracleRecruitingConfig {
  host: string; // e.g. 'cargolux-iajigs.fa.ocs.oraclecloud.com'
  siteNumber: string; // e.g. 'CargoluxGroundStaff'
  keyword?: string; // optional server-side filter, e.g. 'Luxembourg'
  limit?: number;
}

export function jobDetailUrl(config: OracleRecruitingConfig, requisitionId: string): string {
  return `https://${config.host}/hcmUI/CandidateExperience/en/sites/${config.siteNumber}/requisitions/${requisitionId}`;
}

export async function fetchOracleRequisitions(
  config: OracleRecruitingConfig
): Promise<OracleRequisition[]> {
  const finderParts = [
    `siteNumber=${config.siteNumber}`,
    'facetsList=LOCATIONS',
    `limit=${config.limit ?? 50}`,
  ];
  if (config.keyword) {
    finderParts.push(`keyword=${encodeURIComponent(config.keyword)}`);
  }
  const url =
    `https://${config.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList&finder=findReqs;${finderParts.join(',')}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)' },
  });
  if (!response.ok) {
    throw new Error(`Oracle Recruiting Cloud fetch failed (${config.siteNumber}): HTTP ${response.status}`);
  }
  const data = (await response.json()) as { items?: { requisitionList?: OracleRequisition[] }[] };
  const item = data?.items?.[0];
  return (item?.requisitionList ?? []) as OracleRequisition[];
}
