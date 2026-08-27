// Eurostat NUTS 2021 codes for Luxembourg and the immediately adjacent
// "Greater Region" (Grande Région) border areas, per spec Module A step 1.
// EURES's locationCodes field accepts lowercase NUTS codes (verified live
// against https://europa.eu/eures/api/jv-searchengine/public/jv-search/search
// with locationCodes: ["lu"] on 2026-08-27).
export const EURES_LOCATION_CODES = [
  'lu', // Luxembourg (whole country)
  'be34', // Belgium: Province de Luxembourg (direct border)
  'be33', // Belgium: Province de Liège (adjacent Greater Region)
  'deb2', // Germany: Trier (NUTS2, direct border)
  'dec0', // Germany: Saarland (NUTS1, direct border)
  'frf3', // France: Lorraine (NUTS2, part of Grand Est, direct border)
];
