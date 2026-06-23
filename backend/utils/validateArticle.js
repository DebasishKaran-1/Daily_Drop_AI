'use strict';

const HEAD_TIMEOUT_MS = 5_000;

async function headCheck(url) {
    try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
        const res  = await fetch(url, {
            method:   'HEAD',
            signal:   ctrl.signal,
            headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; DailyDropBot/1.0)' },
            redirect: 'follow',
        });
        clearTimeout(tid);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Validates url and image reachability before storing an article.
 * Mutates `stats` in-place for skip-reason accounting.
 *
 * options.requireImage (default true) — set false for sources that never
 * carry images (e.g. Hacker News) so URL-only validation still runs.
 *
 * Returns { valid: boolean, reason: string|null }.
 */
async function validateArticle(url, image, stats, { requireImage = true } = {}) {
    if (!url) {
        stats.skippedNoUrl++;
        return { valid: false, reason: 'no URL' };
    }

    if (requireImage && !image) {
        stats.skippedNoImage++;
        return { valid: false, reason: 'no image' };
    }

    // Run both HEAD checks concurrently — one awaited delay, not two.
    const [urlOk, imgOk] = await Promise.all([
        headCheck(url),
        requireImage && image ? headCheck(image) : Promise.resolve(true),
    ]);

    if (!urlOk) {
        stats.skippedBrokenUrl++;
        return { valid: false, reason: `broken URL: ${url}` };
    }

    if (requireImage && !imgOk) {
        stats.skippedBrokenImage++;
        return { valid: false, reason: `broken image: ${image}` };
    }

    return { valid: true, reason: null };
}

function makeStats() {
    return {
        total:              0,
        saved:              0,
        skippedNoUrl:       0,
        skippedNoImage:     0,
        skippedBrokenUrl:   0,
        skippedBrokenImage: 0,
    };
}

function logStats(prefix, stats) {
    const noUrl = stats.skippedNoUrl > 0 ? `, skipped (no URL): ${stats.skippedNoUrl}` : '';
    console.log(
        `[${prefix}] Fetch stats — ` +
        `total: ${stats.total}, ` +
        `saved: ${stats.saved}, ` +
        `skipped (no image): ${stats.skippedNoImage}, ` +
        `skipped (broken URL): ${stats.skippedBrokenUrl}, ` +
        `skipped (broken image): ${stats.skippedBrokenImage}` +
        noUrl
    );
}

module.exports = { validateArticle, makeStats, logStats };
