# Moovijob.com Luxembourg Job Scraper

## What does Moovijob.com Luxembourg Job Scraper do?

This Actor extracts **job listings from [moovijob.com](https://en.moovijob.com/job-offers/jobs-luxembourg)**, one of Luxembourg's two leading job boards (~6,000 active listings). It reads the [schema.org `JobPosting`](https://schema.org/JobPosting) structured data embedded on each job's detail page — the same markup the site publishes for Google Jobs — rather than scraping fragile page markup, so it stays accurate as the site's design changes. Moovijob.com is protected by a Cloudflare bot challenge, so this Actor uses Apify's proxy infrastructure and a real browser (Playwright) to get past it reliably.

## Why use this Actor?

Moovijob.com has no public API. If you're building a job-matching pipeline, a recruiting dashboard, or market research on Luxembourg's labor market, this Actor gives you structured, machine-readable access to listings you'd otherwise have to check manually.

## How to use Moovijob.com Luxembourg Job Scraper

1. Open the Actor's **Input** tab.
2. (Optional) Change the **Start URL** to a filtered/searched listing page on moovijob.com (e.g. a keyword or location filter) instead of the default full Luxembourg listing.
3. (Optional) Adjust **Max listing pages** and **Max Requests per Crawl** to control how much of the site is crawled.
4. Click **Start**. Results appear in the **Dataset** tab as the run progresses.

## Input

| Field | Type | Description |
|---|---|---|
| `startUrl` | string | Moovijob.com listing page to start from. Defaults to the full Luxembourg listing. |
| `maxListPages` | integer | How many paginated listing pages to follow. |
| `maxRequestsPerCrawl` | integer | Safety cap on total requests (listing + detail pages) per run. |

## Output

Each dataset item is one job listing:

```json
{
  "sourceUrl": "https://en.moovijob.com/job-offers/keyteo/analyste-cyber-securite",
  "title": "Analyste Cyber sécurité",
  "employer": "KEYTEO",
  "city": "Luxembourg",
  "country": "LU",
  "rawDescriptionHtml": "<p>...</p>",
  "datePosted": "2026-08-27T06:25:02+02:00",
  "employmentType": ["FULL_TIME"],
  "estimatedSalary": null
}
```

You can download the dataset in various formats such as JSON, HTML, CSV, or Excel from the Dataset tab.

## Data table

| Field | Description |
|---|---|
| `sourceUrl` | Canonical URL of the job listing |
| `title` | Job title |
| `employer` | Hiring organization name |
| `city` / `country` | Job location, from the posting's structured address |
| `rawDescriptionHtml` | Full job description (HTML, as published) |
| `datePosted` / `employmentType` | Posting metadata |
| `estimatedSalary` | Midpoint of the posted salary range, if disclosed (most listings don't disclose salary) |

## Pricing / Cost estimation

This Actor uses browser-based crawling (required to pass Cloudflare's bot check), so it costs more compute units per page than a plain HTTP scraper. A run limited to a handful of listing pages (tens of jobs) is inexpensive; raise `maxRequestsPerCrawl` deliberately if you want full-catalog coverage.

## Tips

- Narrow `startUrl` to a moovijob.com search/filter URL (e.g. a keyword search) to scrape only relevant roles instead of the entire listing.
- Lower `maxListPages` for frequent/incremental runs; raise it for a one-off full sync.

## FAQ, disclaimers, and support

This Actor only reads publicly published job posting data. It's intended for personal job-search tooling and market research — respect moovijob.com's Terms of Service for your use case. Report issues via the Actor's Issues tab on Apify Console.
