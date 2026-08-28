// Minimal RSS 2.0 <item> extraction — both BGL BNP Paribas (WordPress) and
// CACEIS Luxembourg (Talentsoft) publish job listings this way (verified
// live 2026-08-28, see docs/JOB_SOURCE_INGESTION_STRATEGY.md). Regex over a
// real XML parser is deliberate: these feeds are small (~10-20 items), the
// <item> block structure is simple and consistent, and this matches the
// existing regex-based extraction style already used for sitemaps
// (fetchAdeccoJobs.ts) and JSON-LD (jobPostingJsonLd.ts) rather than adding
// a new dependency for one more shape of "small semi-structured document."
export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

function extractTag(itemXml: string, tag: string): string | null {
  const cdataMatch = itemXml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, 's')
  );
  if (cdataMatch) return cdataMatch[1];
  const plainMatch = itemXml.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's'));
  return plainMatch ? decodeXmlEntities(plainMatch[1]) : null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&#8230;/g, '…');
}

export function parseRssItems(xml: string): RssItem[] {
  const itemBlocks = xml.match(/<item>.*?<\/item>/gs) ?? [];
  return itemBlocks
    .map((block) => ({
      title: extractTag(block, 'title') ?? '',
      link: extractTag(block, 'link') ?? '',
      description: extractTag(block, 'description') ?? '',
      pubDate: extractTag(block, 'pubDate'),
    }))
    .filter((item) => item.title && item.link);
}
