import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

interface JobPostingJsonLd {
    title?: string;
    description?: string;
    datePosted?: string;
    validThrough?: string;
    employmentType?: string | string[];
    jobLocation?: {
        address?: {
            streetAddress?: string;
            postalCode?: string;
            addressLocality?: string;
            addressCountry?: string;
        };
    };
    hiringOrganization?: {
        name?: string;
    };
    baseSalary?: {
        value?: {
            value?: number;
            minValue?: number;
            maxValue?: number;
        };
    };
}

// Listing pages (e.g. /job-offers/jobs-luxembourg or /page-N of it): collect
// job detail links and follow pagination up to maxListPages.
router.addDefaultHandler(async ({ request, page, enqueueLinks, log }) => {
    const maxListPages = (request.userData['maxListPages'] as number) ?? 20;
    const currentPage = (request.userData['listPage'] as number) ?? 1;

    log.info(`Listing page ${currentPage}: ${request.loadedUrl}`);

    await enqueueLinks({
        selector: 'a.card.card-job-offer-new',
        label: 'detail',
    });

    if (currentPage < maxListPages) {
        const nextHref = await page
            .locator('a.page-link', { hasText: 'Next' })
            .first()
            .getAttribute('href')
            .catch(() => null);
        if (nextHref) {
            // No label — routes back to addDefaultHandler for the next listing page.
            await enqueueLinks({
                urls: [nextHref],
                userData: { listPage: currentPage + 1, maxListPages },
            });
        }
    }
});

// Job detail pages embed a full schema.org JobPosting as JSON-LD — far more
// reliable than scraping visible DOM classes, which is why we prefer it.
router.addHandler('detail', async ({ request, page, log, pushData }) => {
    const jsonLdText = await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent()
        .catch(() => null);

    if (!jsonLdText) {
        log.warning('No JSON-LD found on detail page, skipping', { url: request.loadedUrl });
        return;
    }

    let posting: JobPostingJsonLd;
    try {
        posting = JSON.parse(jsonLdText);
    } catch {
        log.warning('Failed to parse JSON-LD, skipping', { url: request.loadedUrl });
        return;
    }

    const address = posting.jobLocation?.address;
    const salary = posting.baseSalary?.value;
    const estimatedSalary =
        salary?.value ??
        (salary?.minValue != null && salary?.maxValue != null
            ? (salary.minValue + salary.maxValue) / 2
            : null);

    await pushData({
        sourceUrl: request.loadedUrl,
        title: posting.title ?? null,
        employer: posting.hiringOrganization?.name ?? null,
        city: address?.addressLocality ?? null,
        country: address?.addressCountry ?? null,
        rawDescriptionHtml: posting.description ?? '',
        datePosted: posting.datePosted ?? null,
        employmentType: posting.employmentType ?? null,
        estimatedSalary,
    });

    log.info(`Scraped: ${posting.title}`, { url: request.loadedUrl });
});
