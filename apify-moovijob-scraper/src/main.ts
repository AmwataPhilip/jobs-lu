import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor } from 'apify';

import { router } from './routes.js';

interface Input {
    startUrl?: string;
    maxListPages?: number;
    maxRequestsPerCrawl?: number;
}

await Actor.init();

const {
    startUrl = 'https://en.moovijob.com/job-offers/jobs-luxembourg',
    maxListPages = 20,
    maxRequestsPerCrawl = 1000,
} = (await Actor.getInput<Input>()) ?? ({} as Input);

// Moovijob.com is behind a Cloudflare bot challenge. The default proxy pool
// can hand out already-flagged datacenter IPs, causing the challenge to loop
// forever until navigation times out — residential IPs pass reliably.
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
    checkAccess: true,
});

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu'],
        },
    },
});

await crawler.run([{ url: startUrl, userData: { listPage: 1, maxListPages } }]);

await Actor.exit();
