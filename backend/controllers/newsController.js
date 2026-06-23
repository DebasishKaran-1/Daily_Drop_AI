const News                              = require('../models/News');
const { fetchFromGoogleRSS }            = require('../services/googleRSSService');
const normalizeCategory                 = require('../utils/normalizeCategory');
const { validateArticle, makeStats, logStats } = require('../utils/validateArticle');

// ── Rate-limit GNews calls: once per 55 minutes ──────────────────────────
let lastGNewsFetchAt = 0;
const GNEWS_COOLDOWN_MS = 55 * 60 * 1000;

// ── Clean articles older than 7 days (only after a successful fetch) ──────
const cleanOldNews = async () => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const result = await News.deleteMany({ publishedAt: { $lt: sevenDaysAgo } });
        if (result.deletedCount > 0) {
            console.log(`[News] Cleaned ${result.deletedCount} articles older than 7 days.`);
        }
        return result.deletedCount;
    } catch (error) {
        console.error('[News] cleanOldNews error:', error);
        return 0;
    }
};

// ── Hacker News fallback (free, no API key, always available) ────────────
const fetchFromHackerNews = async () => {
    console.log('[HN] All higher-priority sources unavailable — fetching from Hacker News API…');

    const extractDomain = (url = '') => {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'news'; }
    };

    // Fetch top story IDs
    const idsRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const allIds = await idsRes.json();
    const topIds = allIds.slice(0, 60);

    // Fetch all story items in parallel
    const itemResults = await Promise.allSettled(
        topIds.map(id =>
            fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
        )
    );

    // Filter to stories with url + title
    const candidates = itemResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(item => item && item.type === 'story' && item.url && item.title);

    const stats = makeStats();
    stats.total = candidates.length;

    // HN articles carry no images — validate URL reachability only
    const checks = await Promise.allSettled(
        candidates.map(async (item) => {
            const result = await validateArticle(item.url, null, stats, { requireImage: false });
            return { item, ...result };
        })
    );

    let stored = 0;
    for (const check of checks) {
        if (check.status !== 'fulfilled') continue;
        const { item, valid, reason } = check.value;

        if (!valid) {
            console.log(`[HN] Skip "${(item.title || '').slice(0, 60)}": ${reason}`);
            continue;
        }

        const publishedAt = new Date(item.time * 1000);
        const domain      = extractDomain(item.url);
        const category    = normalizeCategory(item.title);

        await News.findOneAndUpdate(
            { url: item.url },
            {
                title:       item.title,
                description: `${item.score || 0} points on Hacker News by ${item.by || 'anonymous'}`,
                content:     item.title,
                source:      { name: domain, url: `https://${domain}` },
                url:         item.url,
                image:       null,
                publishedAt,
                category,
                sourceType:  'hackernews',
            },
            { upsert: true, new: true }
        );
        stored++;
        stats.saved++;
    }

    logStats('HN', stats);
    console.log(`[HN] Stored ${stored} Hacker News articles.`);

    if (stored > 0) {
        // HN is emergency fallback — purge GNews, RSS, and legacy pre-migration articles
        // so the feed is pure Hacker News with no mixed content.
        const purged = await News.deleteMany({
            $or: [
                { sourceType: { $in: ['gnews', 'google_rss'] } },
                { sourceType: { $exists: false } },
            ],
        });
        if (purged.deletedCount > 0) {
            console.log(`[HN] Purged ${purged.deletedCount} higher-priority articles (serving HN fallback).`);
        }
    }

    return stored;
};

// @desc    Get all news — returns DB articles, triggers fetch if cooldown has passed
// @route   GET /news
// @access  Private
exports.getNews = async (req, res) => {
    try {
        const { category } = req.query;

        // ── Decide whether to refresh from external source ───────────
        const now = Date.now();
        const timeSinceLastFetch = now - lastGNewsFetchAt;
        const shouldFetchFresh = timeSinceLastFetch > GNEWS_COOLDOWN_MS;

        if (shouldFetchFresh) {
            console.log(`[News] Cooldown elapsed (${Math.round(timeSinceLastFetch / 60000)}m). Fetching fresh articles…`);
            let articlesStored = 0;

            // Level 1: try GNews
            try {
                articlesStored = await exports.fetchAndStoreNews();
                console.log(`[News] GNews stored ${articlesStored} articles.`);
            } catch (gnewsErr) {
                console.warn(`[News] GNews failed: ${gnewsErr.message}`);
            }

            // Level 2: GNews failed/quota — try Google News RSS
            if (articlesStored === 0) {
                try {
                    articlesStored = await fetchFromGoogleRSS();
                    if (articlesStored > 0) console.log(`[News] Google RSS stored ${articlesStored} articles.`);
                } catch (rssErr) {
                    console.warn(`[News] Google RSS failed: ${rssErr.message}`);
                }
            }

            // Level 3: emergency fallback — Hacker News
            if (articlesStored === 0) {
                try {
                    articlesStored = await fetchFromHackerNews();
                } catch (hnErr) {
                    console.error(`[News] Hacker News fallback also failed: ${hnErr.message}`);
                }
            }

            if (articlesStored > 0) {
                lastGNewsFetchAt = Date.now();
                await cleanOldNews();
            } else {
                console.warn('[News] All sources returned 0 articles — will retry next request.');
                // Reset cooldown so next request retries immediately
                lastGNewsFetchAt = 0;
            }
        } else {
            const remainingMin = Math.round((GNEWS_COOLDOWN_MS - timeSinceLastFetch) / 60000);
            console.log(`[News] Serving from DB (cooldown: ${remainingMin}m remaining).`);
        }

        // ── Query DB — widening window if needed ─────────────────────
        const query = {};
        if (category && category !== 'all') query.category = category;

        // Try progressively wider date windows until we have articles
        const windows = [3, 7, 30, 365];
        let articles = [];
        for (const days of windows) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            articles = await News.find({ ...query, publishedAt: { $gte: cutoff } })
                .sort({ publishedAt: -1 })
                .limit(60);
            if (articles.length > 0) break;
        }

        // Final fallback: any articles in DB, no date filter
        if (articles.length === 0) {
            articles = await News.find(query).sort({ publishedAt: -1 }).limit(60);
        }

        console.log(`[News] Returning ${articles.length} articles (category: ${category || 'all'})`);

        res.status(200).json({
            success: true,
            count: articles.length,
            lastUpdated: new Date().toISOString(),
            data: articles
        });
    } catch (error) {
        console.error('[News] getNews error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single news article
// @route   GET /news/:id
// @access  Private
exports.getSingleNews = async (req, res) => {
    try {
        const news = await News.findById(req.params.id);
        if (!news) {
            return res.status(404).json({ success: false, message: 'News not found' });
        }
        res.status(200).json({ success: true, data: news });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Fetch and store news from GNews API — returns count of stored articles
// @access  Internal / POST /news/fetch
exports.fetchAndStoreNews = async (_req, res) => {
    try {
        console.log('[GNews] Fetch started…');

        const API_KEY = process.env.GNEWS_API_KEY;
        if (!API_KEY) throw new Error('GNEWS_API_KEY is missing from environment');

        const categories = [
            { api: 'technology', ui: 'technology' },
            { api: 'business',   ui: 'business'   },
            { api: 'science',    ui: 'science'     },
            { api: 'health',     ui: 'health'      },
            { api: 'sports',     ui: 'sports'      },
            { api: 'nation',     ui: 'politics'    },
            { query: 'climate change', ui: 'climate' }
        ];

        let totalStored = 0;
        const errors = [];
        const stats = makeStats();

        for (const cat of categories) {
            try {
                const url = cat.api
                    ? `https://gnews.io/api/v4/top-headlines?category=${cat.api}&lang=en&max=10&apikey=${API_KEY}`
                    : `https://gnews.io/api/v4/search?q=${encodeURIComponent(cat.query)}&lang=en&max=10&apikey=${API_KEY}`;

                const response = await fetch(url);
                const data = await response.json();

                if (data.errors) {
                    const msg = `GNews error (${cat.ui}): ${data.errors.join(', ')}`;
                    console.warn(`[GNews] ${msg}`);
                    errors.push(msg);
                    continue;
                }

                if (!Array.isArray(data.articles)) continue;

                stats.total += data.articles.length;

                // Validate all articles in this category concurrently —
                // URL + image HEAD checks run in parallel per article,
                // and all articles are checked simultaneously.
                const checks = await Promise.allSettled(
                    data.articles.map(async (article) => {
                        const result = await validateArticle(article.url, article.image, stats);
                        return { article, ...result };
                    })
                );

                for (const check of checks) {
                    if (check.status !== 'fulfilled') continue;
                    const { article, valid, reason } = check.value;

                    if (!valid) {
                        console.log(`[GNews] Skip "${(article.title || '').slice(0, 60)}": ${reason}`);
                        continue;
                    }

                    const publishedDate = new Date(article.publishedAt);
                    if (isNaN(publishedDate.getTime())) continue;

                    await News.findOneAndUpdate(
                        { url: article.url },
                        {
                            title:       article.title,
                            description: article.description,
                            content:     article.content,
                            source:      { name: article.source.name, url: article.source.url },
                            url:         article.url,
                            image:       article.image,
                            publishedAt: publishedDate,
                            category:    cat.ui,
                            sourceType:  'gnews',
                        },
                        { upsert: true, new: true }
                    );
                    totalStored++;
                    stats.saved++;
                }
            } catch (catErr) {
                const msg = `Category ${cat.ui} fetch failed: ${catErr.message}`;
                console.warn(`[GNews] ${msg}`);
                errors.push(msg);
            }
        }

        logStats('GNews', stats);
        console.log(`[GNews] Fetch complete — ${totalStored} articles stored.`);

        if (totalStored > 0) {
            // GNews is live — purge all lower-priority fallback articles so feed is pure GNews.
            const purged = await News.deleteMany({
                $or: [
                    { sourceType: { $in: ['google_rss', 'hackernews'] } },
                    { description: { $regex: /points on Hacker News/i } },
                ],
            });
            if (purged.deletedCount > 0) {
                console.log(`[GNews] Purged ${purged.deletedCount} fallback articles (RSS/HN).`);
            }
        }

        if (res) {
            res.status(200).json({
                success: true,
                message: `Stored ${totalStored} articles. ${errors.join(' ')}`.trim(),
                stats,
            });
        }

        return totalStored;
    } catch (error) {
        console.error('[GNews] fetchAndStoreNews fatal error:', error);
        if (res) {
            res.status(500).json({ success: false, message: error.message });
        }
        throw error;
    }
};
