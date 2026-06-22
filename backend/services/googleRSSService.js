'use strict';

const Parser            = require('rss-parser');
const News              = require('../models/News');
const normalizeCategory = require('../utils/normalizeCategory');

const parser = new Parser({
    customFields: {
        item: [
            ['media:content',   'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
        ],
    },
    timeout: 10_000,
});

const RSS_CATEGORIES = [
    { query: 'technology news',     category: 'technology' },
    { query: 'business finance',    category: 'business'   },
    { query: 'science discovery',   category: 'science'    },
    { query: 'health medicine',     category: 'health'     },
    { query: 'sports',              category: 'sports'     },
    { query: 'politics government', category: 'politics'   },
    { query: 'climate change',      category: 'climate'    },
];

// ── Extract image embedded in the RSS item itself ─────────────────────────
function extractRSSImage(item) {
    if (item.mediaContent) {
        const mc  = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
        const url = mc?.$ ?.url || mc?.url;
        if (url) return url;
    }
    if (item.mediaThumbnail) {
        const mt  = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
        const url = mt?.$ ?.url || mt?.url;
        if (url) return url;
    }
    if (item.enclosure?.url && /image/i.test(item.enclosure.type || '')) {
        return item.enclosure.url;
    }
    const html = item.content || '';
    const m    = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m ? m[1] : null;
}

// ── Attempt OG/twitter image extraction from article page ─────────────────
async function extractOGImage(url) {
    try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 3000);
        const res  = await fetch(url, {
            signal:  ctrl.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DailyDropBot/1.0)' },
        });
        clearTimeout(tid);
        if (!res.ok) return null;
        const html = await res.text();
        const patterns = [
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
            /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
        ];
        for (const re of patterns) {
            const m = html.match(re);
            if (m?.[1]) return m[1];
        }
    } catch { /* timeout / network error — acceptable */ }
    return null;
}

// ── Main export ───────────────────────────────────────────────────────────
exports.fetchFromGoogleRSS = async () => {
    console.log('[RSS] Fetching from Google News RSS…');

    // Fetch all category feeds in parallel
    const feedResults = await Promise.allSettled(
        RSS_CATEGORIES.map(async ({ query, category }) => {
            const url  = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
            const feed = await parser.parseURL(url);
            return { category, items: (feed.items || []).slice(0, 10) };
        })
    );

    // Flatten valid items
    const candidates = [];
    for (const r of feedResults) {
        if (r.status !== 'fulfilled') {
            console.warn('[RSS] Category feed failed:', r.reason?.message);
            continue;
        }
        for (const item of r.value.items) {
            if (item.link && item.title) {
                candidates.push({ item, category: r.value.category });
            }
        }
    }

    if (candidates.length === 0) {
        console.log('[RSS] No usable items from any category feed.');
        return 0;
    }

    console.log(`[RSS] ${candidates.length} items — extracting images in parallel…`);

    // Parallel image enrichment: RSS fields first, OG extraction as fallback
    const enriched = await Promise.allSettled(
        candidates.map(async ({ item, category }) => {
            const image = extractRSSImage(item) ?? await extractOGImage(item.link);
            return { item, category, image: image || null };
        })
    );

    // Store articles
    let stored = 0;
    for (const r of enriched) {
        if (r.status !== 'fulfilled') continue;
        const { item, category, image } = r.value;

        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
        if (isNaN(publishedAt.getTime())) continue;

        // Google News RSS descriptions follow "Title - Source Name" pattern
        const rawSnippet = item.contentSnippet || '';
        const sourceName = item.creator ||
            rawSnippet.replace(/^.+?[–-]\s*/u, '').trim().slice(0, 80) ||
            'Google News';

        let origin = 'https://news.google.com';
        try { origin = new URL(item.link).origin; } catch { /* ignore */ }

        await News.findOneAndUpdate(
            { url: item.link },
            {
                title:       item.title,
                description: rawSnippet || item.title,
                content:     rawSnippet || item.title,
                source:      { name: sourceName, url: origin },
                url:         item.link,
                image,
                publishedAt,
                category:    normalizeCategory(category),
                sourceType:  'google_rss',
            },
            { upsert: true, new: true }
        );
        stored++;
    }

    // Purge GNews and HN articles only after confirming we have RSS content.
    // Also catches legacy pre-migration articles (undefined sourceType) which
    // are all GNews-origin at this point.
    if (stored > 0) {
        const purged = await News.deleteMany({
            $or: [
                { sourceType: { $in: ['gnews', 'hackernews'] } },
                { sourceType: { $exists: false } },
                { description: { $regex: /points on Hacker News/i } },
            ],
        });
        if (purged.deletedCount > 0) {
            console.log(`[RSS] Purged ${purged.deletedCount} non-RSS articles.`);
        }
    }

    const withImages = enriched.filter(r => r.status === 'fulfilled' && r.value.image).length;
    console.log(`[RSS] Done — ${stored} stored, ${withImages}/${candidates.length} with images.`);
    return stored;
};
