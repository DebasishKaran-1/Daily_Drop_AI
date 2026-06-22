// Permanent dark theme
const body = document.body;
body.classList.add('dark-theme');

// ============================================
// Mobile Menu Functionality
// ============================================

const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenuClose = document.getElementById('mobileMenuClose');
const mobileMenu = document.getElementById('mobileMenu');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

function openMobileMenu() {
    mobileMenu?.classList.add('active');
    navbar?.classList.add('menu-open');
    document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
    mobileMenu?.classList.remove('active');
    navbar?.classList.remove('menu-open');
    document.body.style.overflow = '';
}

mobileMenuToggle?.addEventListener('click', openMobileMenu);
mobileMenuClose?.addEventListener('click', closeMobileMenu);

// Close menu when clicking a link
mobileNavLinks.forEach(link => {
    link.addEventListener('click', closeMobileMenu);
});

// Close menu when clicking outside
mobileMenu?.addEventListener('click', (e) => {
    if (e.target === mobileMenu) {
        closeMobileMenu();
    }
});

// ============================================
// News Data (fetched from backend)
let newsData = [];


// ============================================
// Digest Page Functionality
// ============================================

if (document.querySelector('.digest-page')) {

    // Initialize page
    let currentCategory = 'all';
    let newsData = [];
    let lastFetchTime = new Date();

    // ── Feed cache keys ───────────────────────────────────────────
    const FEED_CACHE_KEY    = 'dailydrop_feed_cache';
    const FEED_CACHE_TS_KEY = 'dailydrop_feed_cache_ts';
    const FEED_CACHE_CAT_KEY = 'dailydrop_feed_cache_cat';

    function saveFeedCache(articles, category) {
        try {
            localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(articles));
            localStorage.setItem(FEED_CACHE_TS_KEY, String(Date.now()));
            localStorage.setItem(FEED_CACHE_CAT_KEY, category);
        } catch (_) {}
    }

    function loadFeedCache(category) {
        try {
            const raw = localStorage.getItem(FEED_CACHE_KEY);
            if (!raw) return null;
            const articles = JSON.parse(raw);
            if (!Array.isArray(articles) || articles.length === 0) return null;
            if (category && category !== 'all') {
                const filtered = articles.filter(a => a.category === category);
                return filtered.length > 0 ? filtered : null;
            }
            return articles;
        } catch (_) { return null; }
    }

    // ── Fallback resolver — tries Level 2 then Level 3 ───────────
    // previousData: snapshot of newsData taken before the failing fetch
    function resolveFallback(previousData, category, reason) {
        console.warn(`[Feed] ${reason}`);

        // Level 3: previous in-memory articles (from last successful render)
        if (previousData.length > 0) {
            if (category && category !== 'all') {
                const filtered = previousData.filter(a => a.category === category);
                if (filtered.length > 0) {
                    console.log(`[Feed] Level 3 fallback — ${filtered.length} cached ${category} articles`);
                    return filtered;
                }
                // previousData has no articles for this category — fall through to localStorage
            } else {
                console.log(`[Feed] Level 3 fallback — using previous in-memory feed: ${previousData.length} articles`);
                return previousData;
            }
        }

        // Level 2: localStorage cache
        const cached = loadFeedCache(category);
        if (cached) {
            console.log(`[Feed] Level 2 fallback — using localStorage cache: ${cached.length} articles`);
            return cached;
        }

        console.error('[Feed] All fallback levels exhausted — no articles available.');
        return null;
    }

    // ── Render articles with whatever data is in newsData ─────────
    function applyNewsData(category, isV2, newsGrid, dv2Loading, dv2Premium) {
        if (isV2) {
            renderV2Layout(category);
            dv2Loading.style.display = 'none';
            dv2Premium.style.display = '';
        } else {
            if (newsGrid) newsGrid.innerHTML = '';
            newsData.forEach(news => {
                const card = createNewsCard(news);
                if (newsGrid) newsGrid.appendChild(card);
            });
            document.querySelectorAll('.news-card').forEach(card => {
                card.addEventListener('click', () => openArticleModal(card.dataset.newsId));
            });
        }
    }

    // ── Main fetch + 4-level fallback ────────────────────────────
    async function renderNews(category = 'all', showLoading = true) {
        const newsGrid = document.getElementById('newsGrid');
        const dv2Loading = document.getElementById('dv2LoadingState');
        const dv2Premium = document.getElementById('dv2PremiumLayout');
        const isV2 = Boolean(dv2Premium);

        // Snapshot current articles BEFORE any fetch so we can fall back to them
        const previousData = [...newsData];

        if (showLoading) {
            if (newsGrid) {
                newsGrid.innerHTML = '';
                for (let i = 0; i < 6; i++) {
                    const skeleton = document.getElementById('skeletonTemplate')?.content?.cloneNode(true);
                    if (skeleton) newsGrid.appendChild(skeleton);
                }
            }
            if (isV2) {
                if (dv2Loading) dv2Loading.style.display = '';
                if (dv2Premium) dv2Premium.style.display = 'none';
            }
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/news?category=${category}`, {
                credentials: 'include',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });

            const data = await response.json();

            if (data.success) {
                const fresh = Array.isArray(data.data) ? data.data : [];

                if (fresh.length > 0) {
                    // ── LEVEL 1: fresh API articles ─────────────────────
                    console.log(`[Feed] Level 1 — fresh feed: ${fresh.length} articles`);
                    newsData = fresh;
                    lastFetchTime = new Date();
                    saveFeedCache(fresh, category);
                } else {
                    // API returned success but 0 articles — try fallbacks
                    const fallback = resolveFallback(previousData, category, 'Fresh fetch returned 0 articles.');
                    if (!fallback) {
                        showFeedEmpty(isV2, dv2Loading, dv2Premium, newsGrid);
                        return;
                    }
                    newsData = fallback;
                }
            } else {
                // Auth failure → redirect; all other failures → fallback
                if (data.message && data.message.includes('Not authorized')) {
                    window.location.href = '/signin';
                    return;
                }
                const fallback = resolveFallback(previousData, category, `API responded with success:false — ${data.message || 'unknown error'}`);
                if (!fallback) {
                    showFeedEmpty(isV2, dv2Loading, dv2Premium, newsGrid);
                    return;
                }
                newsData = fallback;
            }
        } catch (error) {
            // ── Network / parse error ────────────────────────────────
            const fallback = resolveFallback(previousData, category, `Network error: ${error.message}`);
            if (!fallback) {
                showFeedEmpty(isV2, dv2Loading, dv2Premium, newsGrid);
                return;
            }
            newsData = fallback;
        }

        // Render whatever data we ended up with (fresh or fallback)
        applyNewsData(category, isV2, newsGrid, dv2Loading, dv2Premium);
    }

    // Show empty state without ever exposing the skeleton V2 layout with no content
    function showFeedEmpty(isV2, dv2Loading, dv2Premium, newsGrid) {
        if (isV2) {
            // Keep dv2Loading visible and swap its message — never show empty dv2Premium
            if (dv2Premium) dv2Premium.style.display = 'none';
            if (dv2Loading) {
                dv2Loading.style.display = '';
                dv2Loading.innerHTML = '<div class="no-news" style="padding:3rem;text-align:center;color:var(--text-secondary)">No news available at the moment. Checking for updates…</div>';
            }
        } else {
            if (newsGrid) newsGrid.innerHTML = '<div class="no-news">No news available at the moment. Checking for updates…</div>';
        }
    }

    // Helper to get consistent category badge classes
    function getCategoryClass(category) {
        const categoryMap = {
            technology: 'badge-technology',
            business: 'badge-business',
            science: 'badge-science',
            politics: 'badge-politics',
            health: 'badge-health',
            climate: 'badge-climate',
            sports: 'badge-sports',
            general: 'badge-general'
        };
        const normalized = category?.toLowerCase() || 'general';
        return categoryMap[normalized] || categoryMap.general;
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function renderMarkdown(value) {
        const lines = escapeHTML(value).split(/\r?\n/);
        const html = [];
        let inList = false;

        const closeList = () => {
            if (inList) {
                html.push('</ul>');
                inList = false;
            }
        };

        lines.forEach(line => {
            const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);

            if (bulletMatch) {
                if (!inList) {
                    html.push('<ul>');
                    inList = true;
                }
                html.push(`<li>${bulletMatch[1].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</li>`);
                return;
            }

            closeList();
            if (line.trim()) {
                html.push(`<p>${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`);
            }
        });

        closeList();
        return html.join('');
    }

    // Create news card element
    function createNewsCard(news) {
        const card = document.createElement('div');
        card.className = 'card news-card'; // Keep news-card for logic, add card for styling
        card.dataset.newsId = news._id;

        const categoryClass = getCategoryClass(news.category);
        const importanceClass = news.importance;

        let importanceIndicator = '';
        for (let i = 0; i < (news.importance === 'high' ? 3 : news.importance === 'medium' ? 2 : 1); i++) {
            importanceIndicator += '<span class="indicator-dot"></span>';
        }

        const summary = news.description || 'No summary available.';
        const sourceName = news.source?.name || news.source || 'Unknown Source';

        // Dynamic time text for live feel
        const publishedDate = new Date(news.publishedAt);
        const diffMs = new Date() - publishedDate;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        let timeText = '';
        if (diffMins < 60) {
            timeText = diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
        } else if (diffHours < 24) {
            timeText = `${diffHours}h ago`;
        } else {
            timeText = publishedDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        card.innerHTML = `
            <div class="card-content">
                <div class="card-header">
                    <span class="tag ${categoryClass}">${news.category.toUpperCase()}</span>
                    <span class="importance-indicator ${importanceClass}">
                        ${importanceIndicator}
                    </span>
                </div>
                <h3 class="title">${news.title}</h3>
                <p class="description">${summary}</p>
            </div>
            <div class="card-footer">
                <span class="card-source">${sourceName}</span>
                <span class="card-time">${timeText}</span>
            </div>
        `;

        return card;
    }

    // ============================================
    // V2 PREMIUM LAYOUT RENDERING
    // ============================================

    function getTimeText(publishedAt) {
        const d = new Date(publishedAt);
        const ms = new Date() - d;
        const mins = Math.floor(ms / 60000);
        const hrs = Math.floor(ms / 3600000);
        if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`;
        if (hrs < 24) return `${hrs}h ago`;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function renderV2Layout(category) {
        const heroInner      = document.getElementById('dv2HeroInner');
        const categoryStrips = document.getElementById('dv2CategoryStrips');
        const latestFeed     = document.getElementById('dv2LatestFeed');
        const latestCount    = document.getElementById('dv2LatestCount');

        // When a specific category is selected, restrict the view to matching articles only.
        // Sidebar and ticker always use all articles for accurate coverage counts.
        const viewData = (category === 'all')
            ? newsData
            : newsData.filter(a => a.category === category);

        if (viewData.length === 0) {
            if (heroInner) heroInner.innerHTML = '<p class="dv2-empty-note" style="padding:2rem;color:var(--text-secondary)">No articles in this category yet.</p>';
            if (categoryStrips) categoryStrips.innerHTML = '';
            if (latestFeed) latestFeed.innerHTML = '';
            if (latestCount) latestCount.textContent = '';
            renderV2Sidebar(newsData);
            populateTicker(newsData);
            return;
        }

        const usedIds = new Set();

        // 1. Hero — first article from the filtered set
        const hero = viewData[0];
        usedIds.add(hero._id);
        if (heroInner) {
            heroInner.innerHTML = '';
            heroInner.appendChild(createV2HeroCard(hero));
        }

        // 2. Category strips — only when "All" is selected (viewData === newsData here)
        if (categoryStrips) {
            categoryStrips.innerHTML = '';
            if (category === 'all') {
                const byCategory = {};
                newsData.forEach(a => {
                    if (!usedIds.has(a._id)) {
                        if (!byCategory[a.category]) byCategory[a.category] = [];
                        byCategory[a.category].push(a);
                    }
                });
                Object.keys(byCategory)
                    .filter(cat => byCategory[cat].length >= 2)
                    .slice(0, 5)
                    .forEach(cat => {
                        categoryStrips.appendChild(createV2CategoryStrip(cat, byCategory[cat], usedIds));
                    });
            }
        }

        // 3. Latest — remaining articles from the filtered set
        const remaining = viewData.filter(a => !usedIds.has(a._id));
        if (latestFeed) {
            latestFeed.innerHTML = '';
            if (remaining.length === 0) {
                latestFeed.innerHTML = '<p class="dv2-empty-note">All stories are featured above.</p>';
            } else {
                remaining.forEach(a => latestFeed.appendChild(createV2LatestCard(a)));
            }
        }
        if (latestCount) latestCount.textContent = remaining.length > 0 ? `${remaining.length} stories` : '';

        // 4. Sidebar — always full newsData for accurate coverage counts
        renderV2Sidebar(newsData);

        // 5. Ticker — always full newsData
        populateTicker(newsData);
    }

    function createV2HeroCard(news) {
        const categoryClass = getCategoryClass(news.category);
        const sourceName = news.source?.name || news.source || 'Unknown Source';
        const hasImage = Boolean(news.image);

        const div = document.createElement('div');
        div.className = 'dv2-hero-card';
        div.dataset.newsId = news._id;

        div.innerHTML = `
            <div class="dv2-hero-image-col${!hasImage ? ' dv2-no-img' : ''}">
                ${hasImage ? `<img src="${escapeHTML(news.image)}" alt="${escapeHTML(news.title)}" loading="eager" onerror="this.closest('.dv2-hero-image-col').classList.add('dv2-no-img');this.remove();">` : ''}
                <div class="dv2-hero-img-overlay" aria-hidden="true"></div>
            </div>
            <div class="dv2-hero-content-col">
                <div class="dv2-hero-top-row">
                    <span class="tag ${categoryClass}">${escapeHTML(news.category).toUpperCase()}</span>
                    <span class="dv2-hero-time">${getTimeText(news.publishedAt)}</span>
                </div>
                <h2 class="dv2-hero-title">${escapeHTML(news.title)}</h2>
                <p class="dv2-hero-desc">${escapeHTML(news.description || '')}</p>
                <div class="dv2-hero-footer-row">
                    <span class="dv2-hero-source">${escapeHTML(sourceName)}</span>
                    <div class="dv2-hero-actions">
                        <button class="modal-ai-btn dv2-ai-trigger" data-news-id="${news._id}" type="button">
                            <span aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path d="M7.2 10.2h9.6M7.2 14h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                                    <path d="M5.6 18.4c-1.8-1.5-2.8-3.4-2.8-5.6 0-4.5 3.9-8 8.7-8s8.7 3.5 8.7 8-3.9 8-8.7 8c-1.1 0-2.2-.2-3.2-.5l-3.5.9.8-2.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                </svg>
                            </span>
                            Ask AI
                        </button>
                        <button class="read-btn dv2-read-btn" type="button" data-url="${escapeHTML(news.url || '')}">
                            Read Full Article
                        </button>
                    </div>
                </div>
            </div>`;

        return div;
    }

    function createV2CategoryStrip(cat, articles, usedIds) {
        const featured = articles[0];
        const secondary = articles.slice(1, 4);
        usedIds.add(featured._id);
        secondary.forEach(a => usedIds.add(a._id));

        const categoryClass = getCategoryClass(cat);
        const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
        const featuredSource = featured.source?.name || featured.source || 'Unknown';
        const featuredHasImage = Boolean(featured.image);

        const section = document.createElement('section');
        section.className = 'dv2-cat-strip';

        section.innerHTML = `
            <div class="dv2-strip-hdr">
                <span class="tag ${categoryClass}">${catLabel.toUpperCase()}</span>
                <div class="dv2-strip-rule" aria-hidden="true"></div>
            </div>
            <div class="dv2-strip-grid">
                <div class="dv2-strip-featured" data-news-id="${featured._id}">
                    <div class="dv2-strip-feat-img${!featuredHasImage ? ' dv2-no-img' : ''}">
                        ${featuredHasImage ? `<img src="${escapeHTML(featured.image)}" alt="${escapeHTML(featured.title)}" loading="lazy" onerror="this.closest('.dv2-strip-feat-img').classList.add('dv2-no-img');this.remove();">` : ''}
                    </div>
                    <div class="dv2-strip-feat-body">
                        <h3 class="dv2-strip-feat-title">${escapeHTML(featured.title)}</h3>
                        <p class="dv2-strip-feat-desc">${escapeHTML(featured.description || '')}</p>
                        <span class="dv2-src-label">${escapeHTML(featuredSource)}</span>
                    </div>
                </div>
                <div class="dv2-strip-secondary-list">
                    ${secondary.map(a => {
                        const src = a.source?.name || a.source || 'Unknown';
                        const hasImg = Boolean(a.image);
                        return `<div class="dv2-strip-secondary" data-news-id="${a._id}">
                            ${hasImg ? `<div class="dv2-strip-sec-img"><img src="${escapeHTML(a.image)}" alt="${escapeHTML(a.title)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
                            <div class="dv2-strip-sec-body${!hasImg ? ' dv2-full-width' : ''}">
                                <h4 class="dv2-strip-sec-title">${escapeHTML(a.title)}</h4>
                                <span class="dv2-src-label">${escapeHTML(src)}</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;

        return section;
    }

    function createV2LatestCard(news) {
        const categoryClass = getCategoryClass(news.category);
        const sourceName = news.source?.name || news.source || 'Unknown Source';
        const hasImage = Boolean(news.image);

        const div = document.createElement('div');
        div.className = 'dv2-latest-card';
        div.dataset.newsId = news._id;

        div.innerHTML = `
            ${hasImage ? `<div class="dv2-latest-thumb"><img src="${escapeHTML(news.image)}" alt="${escapeHTML(news.title)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
            <div class="dv2-latest-body${!hasImage ? ' dv2-full-width' : ''}">
                <div class="dv2-latest-meta">
                    <span class="tag ${categoryClass}">${escapeHTML(news.category).toUpperCase()}</span>
                    <span class="card-time">${getTimeText(news.publishedAt)}</span>
                </div>
                <h4 class="dv2-latest-title">${escapeHTML(news.title)}</h4>
                <span class="card-source">${escapeHTML(sourceName)}</span>
            </div>`;

        return div;
    }

    function renderV2Sidebar(articles) {
        const CAT_COLORS = {
            technology: '#818CF8', business: '#34D399', science: '#A78BFA',
            politics: '#F87171', health: '#F472B6', climate: '#4ADE80',
            sports: '#FBBF24', general: '#9CA3AF'
        };

        // Coverage breakdown
        const coverageBody = document.getElementById('dv2CoverageBody');
        if (coverageBody) {
            const counts = {};
            articles.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1; });
            const total = articles.length;
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            coverageBody.innerHTML = sorted.map(([cat, count]) => {
                const pct = Math.round((count / total) * 100);
                const color = CAT_COLORS[cat] || '#9CA3AF';
                const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                return `<div class="dv2-cov-row">
                    <div class="dv2-cov-label"><span>${label}</span><span class="dv2-cov-num">${count}</span></div>
                    <div class="dv2-cov-track"><div class="dv2-cov-bar" style="width:${pct}%;background:${color}"></div></div>
                </div>`;
            }).join('');
        }

        // Trending — articles 2–6 by recency
        const trendingBody = document.getElementById('dv2TrendingBody');
        if (trendingBody) {
            const trending = articles.slice(1, 6);
            trendingBody.innerHTML = trending.map((a, i) => `
                <div class="dv2-trend-item" data-news-id="${a._id}">
                    <span class="dv2-trend-rank">${i + 1}</span>
                    <div class="dv2-trend-body">
                        <h4 class="dv2-trend-title">${escapeHTML(a.title)}</h4>
                        <span class="tag ${getCategoryClass(a.category)}">${escapeHTML(a.category).toUpperCase()}</span>
                    </div>
                </div>`).join('');
        }

        // AI Intelligence Panel
        const aiBody = document.getElementById('dv2AIBody');
        if (aiBody) {
            const counts = {};
            articles.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1; });
            const topEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            const topLabel = topEntry ? topEntry[0].charAt(0).toUpperCase() + topEntry[0].slice(1) : 'General';
            const topPct = topEntry ? Math.round((topEntry[1] / articles.length) * 100) : 0;
            const catCount = Object.keys(counts).length;

            aiBody.innerHTML = `
                <div class="dv2-ai-insight">
                    <p class="dv2-ai-text">"${topLabel} dominated today's coverage with ${topPct}% of all stories — a signal worth watching."</p>
                </div>
                <div class="dv2-ai-insight">
                    <p class="dv2-ai-text">${articles.length} articles analyzed across ${catCount} topic${catCount !== 1 ? 's' : ''} this session.</p>
                </div>
                <p class="dv2-ai-hint">Click any article and tap <strong>Ask AI</strong> to explore deeper.</p>`;
        }
    }

    function populateTicker(articles) {
        const tickerInner = document.getElementById('tickerInner');
        if (!tickerInner || articles.length === 0) return;

        const items = articles.slice(0, 15);

        const buildSet = () => items.map(a =>
            `<span class="ticker-item" data-news-id="${a._id}">${escapeHTML(a.title)}</span><span class="ticker-sep" aria-hidden="true">•</span>`
        ).join('');

        // Duplicate content for seamless infinite loop (translateX -50% = one full pass)
        tickerInner.innerHTML = buildSet() + buildSet();

        tickerInner.querySelectorAll('.ticker-item').forEach(item => {
            item.addEventListener('click', () => {
                const newsId = item.dataset.newsId;
                if (newsId) openArticleModal(newsId);
            });
        });
    }

    // Category filter functionality
    const categoryChips = document.querySelectorAll('.category-chip');
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            categoryChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentCategory = chip.dataset.category;
            renderNews(currentCategory);
        });
    });

    // Auto-refresh every 5 minutes
    setInterval(() => {
        console.log('Auto-refreshing live news...');
        renderNews(currentCategory, false); // Fetch in background without skeleton
    }, 5 * 60 * 1000);

    // V2 layout — single delegated click handler
    document.getElementById('dv2PremiumLayout')?.addEventListener('click', (e) => {
        const aiBtn = e.target.closest('.dv2-ai-trigger');
        if (aiBtn) {
            e.stopPropagation();
            const newsId = aiBtn.dataset.newsId || aiBtn.closest('[data-news-id]')?.dataset.newsId;
            if (newsId) openAIChatModal(newsId);
            return;
        }
        // External "Read Full Article" button
        const readBtn = e.target.closest('.dv2-read-btn');
        if (readBtn) {
            e.stopPropagation();
            const url = readBtn.dataset.url;
            if (url) window.open(url, '_blank', 'noopener');
            return;
        }
        // Any card with data-news-id → article modal
        const card = e.target.closest('[data-news-id]');
        if (card) openArticleModal(card.dataset.newsId);
    });

    // Article Modal
    const modal = document.getElementById('articleModal');
    const modalContent = document.getElementById('modalContent');
    const modalClose = document.getElementById('modalClose');
    const aiChatModal = document.getElementById('aiChatModal');
    const aiChatContent = document.getElementById('aiChatContent');
    const aiChatClose = document.getElementById('aiChatClose');

    function openArticleModal(newsId) {
        const news = newsData.find(item => item._id === newsId);
        if (!news) return;

        const categoryClass = getCategoryClass(news.category);
        const importanceClass = news.importance;

        let importanceIndicator = '';
        for (let i = 0; i < (news.importance === 'high' ? 3 : news.importance === 'medium' ? 2 : 1); i++) {
            importanceIndicator += '<span class="indicator-dot"></span>';
        }

        const summary = news.description || 'No summary available.';
        const content = news.content || '';
        const sourceName = news.source?.name || news.source || 'Unknown Source';
        const publishedDate = new Date(news.publishedAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        modalContent.innerHTML = `
            <div class="meta-row">
                <span class="category">${news.category.toUpperCase()}</span>
                <span class="dots">••</span>
            </div>
            <div class="modal-body">
                <h2 class="title">${news.title}</h2>
                <div class="highlight modal-summary description">
                    ${summary}
                </div>
            </div>
            <div class="modal-footer">
                <span class="card-time">${publishedDate}</span>
                <div class="modal-action-group">
                    ${createArticleAIButton()}
                    <button class="read-btn" onclick="window.open('${news.url}', '_blank')">
                        Read Full Article at Source
                    </button>
                </div>
            </div>
        `;

        modalContent.querySelector('.modal-ai-btn')?.addEventListener('click', () => {
            openAIChatModal(news._id);
        });

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeArticleModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function openAIChatModal(newsId) {
        const news = newsData.find(item => item._id === newsId);
        if (!news || !aiChatModal || !aiChatContent) return;

        const sourceName = news.source?.name || news.source || 'Unknown Source';
        const summary = news.description || 'No summary available.';

        aiChatContent.dataset.newsId = news._id;
        aiChatContent.innerHTML = createArticleAIChat(news, sourceName, summary);
        bindAIChatModalInteractions();
        aiChatModal.classList.add('active');
        aiChatModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeAIChatModal() {
        aiChatModal?.classList.remove('active');
        aiChatModal?.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = modal?.classList.contains('active') ? 'hidden' : '';
    }

    function createArticleAIButton() {
        return `
            <button class="modal-ai-btn" type="button">
                <span class="modal-ai-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M7.2 10.2h9.6M7.2 14h6.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        <path d="M5.6 18.4c-1.8-1.5-2.8-3.4-2.8-5.6C2.8 8 6.9 4.4 12 4.4S21.2 8 21.2 12.8 17.1 21.2 12 21.2c-1.2 0-2.3-.2-3.4-.6l-3.7 1 1-3.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                    </svg>
                </span>
                <span>Ask AI about this article</span>
            </button>
        `;
    }

    function createAIQuickActions(prompts) {
        return prompts.map(prompt => `<button class="ai-prompt" type="button">${escapeHTML(prompt)}</button>`).join('');
    }

    function createAIMessage(role, content, options = {}) {
        const message = document.createElement('div');
        message.className = `ai-message ai-message-${role}${options.loading ? ' ai-message-loading' : ''}`;

        const bubble = document.createElement('span');
        if (options.loading) {
            bubble.innerHTML = `
                <span class="ai-loading-spinner" aria-hidden="true"></span>
                <span>${escapeHTML(content)}</span>
                <span class="ai-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            `;
        } else if (role === 'assistant') {
            bubble.innerHTML = renderMarkdown(content);
        } else {
            bubble.textContent = content;
        }

        message.appendChild(bubble);
        return message;
    }

    function createArticleAIChat(news, sourceName, summary) {
        const prompts = [
            'Summarize',
            'Key Takeaways',
            'Explain Simply',
            'Why It Matters'
        ];
        const categoryLabel = escapeHTML(news.category || 'General').toUpperCase();

        return `
            <div class="ai-chat-header">
                <div class="ai-chat-mark" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M7 10.4h10M7 14.2h6.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                        <path d="M5.8 18.3c-1.6-1.4-2.5-3.2-2.5-5.3 0-4.5 3.8-7.9 8.7-7.9s8.7 3.4 8.7 7.9-3.8 7.9-8.7 7.9c-1.1 0-2.2-.17-3.2-.52L5 21.2l.8-2.9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                    </svg>
                </div>
                <div>
                    <p class="ai-chat-kicker">Article assistant</p>
                    <h2 id="aiChatTitle">Ask AI About This Article</h2>
                </div>
            </div>
            <div class="ai-chat-article">
                <span class="ai-chat-category">${categoryLabel}</span>
                <h3>${escapeHTML(news.title)}</h3>
                <p>${escapeHTML(summary)}</p>
                <span>${escapeHTML(sourceName)}</span>
            </div>
            <div class="ai-chat-thread" aria-live="polite">
                <div class="ai-message ai-message-assistant">
                    <span>Ready when you are. I can summarize, simplify, or answer questions using only this article.</span>
                </div>
            </div>
            <div class="ai-chat-prompts" aria-label="Example prompts">
                ${createAIQuickActions(prompts)}
            </div>
            <form class="ai-chat-input-row">
                <input class="ai-chat-input" type="text" placeholder="Ask about this article..." aria-label="Ask about this article">
                <button class="ai-chat-send" type="submit" aria-label="Ask AI">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            </form>
        `;
    }

    function bindAIChatModalInteractions() {
        const input = aiChatContent?.querySelector('.ai-chat-input');
        const thread = aiChatContent?.querySelector('.ai-chat-thread');
        const form = aiChatContent?.querySelector('.ai-chat-input-row');
        const sendButton = aiChatContent?.querySelector('.ai-chat-send');
        const promptButtons = aiChatContent ? Array.from(aiChatContent.querySelectorAll('.ai-prompt')) : [];

        const articleNews = newsData.find(item => item._id === aiChatContent?.dataset.newsId);
        const article = articleNews ? {
            title: articleNews.title || '',
            description: articleNews.description || '',
            content: articleNews.content || ''
        } : null;
        let isLoading = false;

        const setLoading = (loading) => {
            isLoading = loading;
            if (input) input.disabled = loading;
            if (sendButton) sendButton.disabled = loading;
            promptButtons.forEach(button => {
                button.disabled = loading;
            });
        };

        const scrollToLatest = () => {
            if (thread) {
                thread.scrollTop = thread.scrollHeight;
            }
        };

        const appendMessage = (role, content, options = {}) => {
            if (!thread) return null;

            const message = createAIMessage(role, content, options);
            thread.appendChild(message);
            scrollToLatest();
            return message;
        };

        const askArticleAI = async (question) => {
            const value = question?.trim();
            if (!value || !thread || !article || isLoading) return;

            appendMessage('user', value);
            const loadingMessage = appendMessage('assistant', 'Analyzing article...', { loading: true });
            setLoading(true);

            try {
                const token = localStorage.getItem('token');
                const headers = {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                };
                const response = await fetch('/api/article-ai', {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify({
                        article,
                        question: value
                    })
                });
                const data = await response.json().catch(() => ({}));

                let answer;
                if (data.success && data.answer) {
                    answer = data.answer;
                } else if (!response.ok || !data.success) {
                    answer = data.message || 'AI assistant unavailable. Please try again.';
                } else {
                    answer = 'This article does not contain that information.';
                }

                loadingMessage?.remove();
                appendMessage('assistant', answer);
            } catch (error) {
                console.error('Article AI request failed:', error);
                loadingMessage?.remove();
                appendMessage('assistant', 'AI assistant unavailable. Please try again.');
            } finally {
                setLoading(false);
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }
        };

        promptButtons.forEach(promptButton => {
            promptButton.addEventListener('click', () => {
                askArticleAI(promptButton.textContent.trim());
            });
        });

        form?.addEventListener('submit', (event) => {
            event.preventDefault();
            const value = input?.value.trim();
            if (!value) return;
            askArticleAI(value);
        });
    }

    // Modal close handlers
    modalClose?.addEventListener('click', closeArticleModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeArticleModal();
    });

    aiChatClose?.addEventListener('click', closeAIChatModal);
    aiChatModal?.addEventListener('click', (e) => {
        if (e.target === aiChatModal) closeAIChatModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (aiChatModal?.classList.contains('active')) {
                closeAIChatModal();
            } else if (modal?.classList.contains('active')) {
                closeArticleModal();
            }
        }
    });

    // Initial render
    renderNews();
}

// ============================================
// Landing Page Animations
// ============================================

if (document.querySelector('.hero')) {
    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href.length > 1) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe feature cards and step cards
    document.querySelectorAll('.feature-card, .step-card').forEach(el => {
        observer.observe(el);
    });

    // Add a very light hero parallax without querying the DOM on every scroll.
    let ticking = false;
    const parallaxElements = document.querySelectorAll('.product-panel');
    const heroSection = document.querySelector('.hero');

    function updateParallax() {
        const scrolled = window.pageYOffset;

        if (heroSection && scrolled > heroSection.offsetHeight) {
            ticking = false;
            return;
        }

        parallaxElements.forEach((el, index) => {
            const speed = 0.05 + (index * 0.015);
            const yPos = -(scrolled * speed);
            el.style.transform = `translate3d(0, ${yPos}px, 0)`;
        });

        ticking = false;
    }

    if (parallaxElements.length) {
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }, { passive: true });
    }
}

// ============================================
// Navbar scroll effect
// ============================================

const navbar = document.querySelector('.navbar');
const NAV_ENTER_SCROLL = 56;
const NAV_EXIT_SCROLL = 18;
let navbarIsScrolled = false;
let navTicking = false;

function updateNavbarState() {
    if (!navbar) return;

    const currentScroll = window.pageYOffset;
    const shouldBeScrolled = navbarIsScrolled
        ? currentScroll > NAV_EXIT_SCROLL
        : currentScroll > NAV_ENTER_SCROLL;

    if (shouldBeScrolled !== navbarIsScrolled) {
        navbarIsScrolled = shouldBeScrolled;
        navbar.classList.toggle('is-scrolled', navbarIsScrolled);
    }

    navTicking = false;
}

window.addEventListener('scroll', () => {
    if (!navTicking) {
        window.requestAnimationFrame(updateNavbarState);
        navTicking = true;
    }
}, { passive: true });

updateNavbarState();

// The digest filter uses CSS sticky positioning. Keeping it out of the scroll
// loop avoids fixed-layer churn against the blurred navbar and card grid.

// ============================================
// Enhanced hover effects
// ============================================

// Add ripple effect on button clicks
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn') || e.target.closest('.btn')) {
        const button = e.target.classList.contains('btn') ? e.target : e.target.closest('.btn');
        const ripple = document.createElement('span');
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.5);
            top: ${y}px;
            left: ${x}px;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;

        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        button.appendChild(ripple);

        setTimeout(() => ripple.remove(), 600);
    }
});

// Add ripple animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// Performance optimization
// ============================================

// Lazy load images (if we add images later)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// ============================================
// Console easter egg
// ============================================

console.log('%c🚀 DailyDrop', 'font-size: 24px; font-weight: bold; color: #6366F1;');
console.log('%cWelcome to the future of news.', 'font-size: 14px; color: #8B5CF6;');
console.log('%cBuilt with ❤️ and cutting-edge web technologies.', 'font-size: 12px; color: #9CA3AF;');

// ============================================
// Archive Page Functionality
// ============================================

if (document.querySelector('.archive-page')) {
    const archiveGrid = document.getElementById('archiveGrid');

    // Generate mock archive data for the last 30 days
    const archiveData = [];
    const today = new Date(2026, 0, 23); // Jan 23, 2026

    // Helper to get random topics
    const topics = [
        "AI Breakthroughs", "Global Markets", "Climate Policy", "Space Exploration",
        "Medical Advances", "Tech Regulation", "Renewable Energy", "EV Market",
        "Crypto Trends", "Startups", "Biotech"
    ];

    for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);

        // Skip current day (it's in Digest)
        if (i === 0) continue;

        const randomTopics = [];
        const topicCount = Math.floor(Math.random() * 2) + 2; // 2 or 3 topics
        for (let j = 0; j < topicCount; j++) {
            randomTopics.push(topics[Math.floor(Math.random() * topics.length)]);
        }

        archiveData.push({
            date: date,
            readTime: Math.floor(Math.random() * 3) + 4 + ' min read', // 4-6 min
            headlines: randomTopics,
            storyCount: Math.floor(Math.random() * 4) + 6 // 6-9 stories
        });
    }

    // Date formatting helpers
    const getMonthYear = (date) => {
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const getDayNumber = (date) => {
        return date.getDate();
    };

    const getWeekday = (date) => {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    };

    // Render archive cards
    function renderArchive() {
        if (!archiveGrid) return;

        archiveGrid.innerHTML = '';

        // Animation delay index
        let delayIndex = 0;

        archiveData.forEach(item => {
            const card = document.createElement('a');
            card.href = 'digest.html'; // In a real app, this would pass a date query param
            card.className = 'archive-card fade-in';
            card.style.animationDelay = `${delayIndex * 0.1}s`;
            card.style.textDecoration = 'none';

            const headlinesText = item.headlines.join(' • ');

            card.innerHTML = `
                <div class="archive-date-col">
                    <span class="archive-day">${getDayNumber(item.date)}</span>
                    <span class="archive-weekday">${getWeekday(item.date)}</span>
                </div>
                <div class="archive-content-col">
                    <div class="archive-meta">
                        <span class="archive-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                            </svg>
                            ${item.storyCount} stories
                        </span>
                        <span class="archive-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            ${item.readTime}
                        </span>
                    </div>
                    <div class="archive-headlines">
                        <strong>Top Stories:</strong> ${headlinesText}
                    </div>
                </div>
                <div class="archive-actions-col">
                    <div class="btn-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            `;

            archiveGrid.appendChild(card);
            delayIndex++;
        });
    }

    // Initialize
    renderArchive();
}


// ============================================
// Authentication & Navigation Logic
// ============================================
// Backend API URL
const API_URL = '/auth';

const auth = {
    currentUser: null,

    isAuthenticated: () => Boolean(auth.currentUser || localStorage.getItem('user')),
    user: () => auth.currentUser || JSON.parse(localStorage.getItem('user') || '{}'),
    authHeaders: () => ({}),

    storeSession: (data) => {
        if (data.token) {
            localStorage.setItem('token', data.token);
        }
        if (data.user) {
            auth.currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(data.user));
        }
    },

    clearSession: () => {
        auth.currentUser = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },

    request: async (path, options = {}) => {
        const headers = {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...auth.authHeaders(),
            ...(options.headers || {})
        };

        const response = await fetch(`${API_URL}${path}`, {
            credentials: 'include',
            ...options,
            headers
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Request failed. Please try again.');
        }

        return data;
    },

    login: async (email, password) => {
        const data = await auth.request('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        auth.storeSession(data);
        window.location.href = 'index.html';
    },

    signup: async (name, email, password) => {
        const data = await auth.request('/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });
        auth.storeSession(data);
        window.location.href = 'index.html';
    },

    logout: async () => {
        try {
            await auth.request('/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            auth.clearSession();
            window.location.href = 'index.html';
        }
    },

    loadUser: async () => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('auth') || params.get('token')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            const data = await auth.request('/me');
            auth.storeSession(data);
            auth.updateNavigation();
        } catch (error) {
            auth.clearSession();
            auth.updateNavigation();
        }
    },

    checkProtected: () => {
        const path = window.location.pathname;
        const protectedPages = ['digest.html', 'profile.html', 'saved.html', 'saved-articles.html'];
        const isProtected = protectedPages.some(page => path.endsWith(page));

        if (isProtected && !auth.isAuthenticated()) {
            window.location.href = `/signin?next=${encodeURIComponent(path.split('/').pop())}`;
        }
    },

    forgotPassword: async (email) => auth.request('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
    }),

    resetPassword: async (token, password) => {
        const data = await auth.request(`/reset-password/${encodeURIComponent(token)}`, {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        auth.storeSession(data);
        return data;
    },

    updateNavigation: () => {
        const desktopNav = document.getElementById('desktopNav');
        const mobileNav = document.getElementById('mobileNav');
        const authLink = document.getElementById('authLink');
        const mobileAuthLink = document.getElementById('mobileAuthLink');
        const primaryCta = document.getElementById('primaryCta');
        const user = auth.user();

        // Update CTA on landing page
        if (primaryCta && !auth.isAuthenticated()) {
            primaryCta.href = 'signin.html';
            primaryCta.querySelector('span').textContent = 'Get Started';
        } else if (primaryCta && auth.isAuthenticated()) {
            primaryCta.href = 'digest.html';
            primaryCta.querySelector('span').textContent = 'View Today\'s Digest';
        }

        if (auth.isAuthenticated()) {
            // Update Desktop Nav
            if (desktopNav) {
                if (authLink) authLink.remove();

                if (!document.getElementById('profileLink')) {
                    const profileLink = document.createElement('a');
                    profileLink.href = 'index.html';
                    profileLink.id = 'profileLink';
                    profileLink.className = 'nav-link nav-profile-link';
                    const _initial = (user.name || user.email || 'U').slice(0, 1).toUpperCase();
                    profileLink.innerHTML = user.avatarUrl
                        ? `<img class="nav-avatar" src="${user.avatarUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="nav-avatar-fallback" style="display:none">${_initial}</span><span>${user.name || 'Profile'}</span>`
                        : `<span class="nav-avatar-fallback">${_initial}</span><span>${user.name || 'Profile'}</span>`;
                    desktopNav.appendChild(profileLink);
                }

                if (!document.getElementById('logoutLink')) {
                    const logoutLink = document.createElement('a');
                    logoutLink.href = '#';
                    logoutLink.id = 'logoutLink';
                    logoutLink.className = 'nav-link';
                    logoutLink.textContent = 'Log Out';
                    logoutLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        auth.logout();
                    });
                    desktopNav.appendChild(logoutLink);
                }
            }

            // Update Mobile Nav
            if (mobileNav) {
                if (mobileAuthLink) mobileAuthLink.remove();

                if (!document.getElementById('mobileProfile')) {
                    const mProfile = document.createElement('a');
                    mProfile.href = 'index.html';
                    mProfile.id = 'mobileProfile';
                    mProfile.className = 'mobile-nav-link';
                    mProfile.textContent = user.name ? `Profile · ${user.name}` : 'Profile';
                    mobileNav.appendChild(mProfile);
                }

                if (!document.getElementById('mobileLogout')) {
                    const mLogout = document.createElement('a');
                    mLogout.href = '#';
                    mLogout.id = 'mobileLogout';
                    mLogout.className = 'mobile-nav-link';
                    mLogout.textContent = 'Log Out';
                    mLogout.addEventListener('click', (e) => {
                        e.preventDefault();
                        auth.logout();
                    });
                    mobileNav.appendChild(mLogout);
                }
            }
        } else {
            document.getElementById('logoutLink')?.remove();
            document.getElementById('profileLink')?.remove();
            document.getElementById('mobileLogout')?.remove();
            document.getElementById('mobileProfile')?.remove();
        }
    }
};

window.DailyDropAuth = auth;

// Run Checks
auth.loadUser().finally(() => {
    auth.checkProtected();
});
document.addEventListener('DOMContentLoaded', function() {
    [
        'initTheme',
        'initMobileMenu',
        'initCategoryFilters',
        'initNewsFeed',
        'initAuth',
        'initStats'
    ].forEach((initializer) => {
        if (typeof window[initializer] === 'function') {
            window[initializer]();
        }
    });
    auth.updateNavigation();
});

// Form Listeners
const signinForm = document.getElementById('signinForm');
if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleAuthSubmit(signinForm, () => auth.login(
            document.getElementById('email').value,
            document.getElementById('password').value
        ));
    });
}

const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleAuthSubmit(signupForm, () => auth.signup(
            document.getElementById('name').value,
            document.getElementById('email').value,
            document.getElementById('password').value
        ));
    });
}

const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleAuthSubmit(forgotPasswordForm, async () => {
            const data = await auth.forgotPassword(document.getElementById('email').value);
            setFormMessage(forgotPasswordForm, data.resetUrl ? `${data.message} ${data.resetUrl}` : data.message, 'success');
        }, { keepSuccess: true });
    });
}

const resetPasswordForm = document.getElementById('resetPasswordForm');
if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = new URLSearchParams(window.location.search).get('token') || '';
        await handleAuthSubmit(resetPasswordForm, async () => {
            await auth.resetPassword(token, document.getElementById('password').value);
            setFormMessage(resetPasswordForm, 'Password updated. Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 700);
        }, { keepSuccess: true });
    });
}

document.querySelectorAll('.social-btn').forEach(button => {
    button.addEventListener('click', () => {
        button.classList.add('is-loading');
        window.location.href = `${API_URL}/google`;
    });
});

document.querySelectorAll('.forgot-link').forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.href = 'forgot-password.html';
    });
});

const authErrorMap = {
    'google-not-configured': 'Google sign in is not configured yet.',
    'google-auth-failed': 'Google sign in could not be completed.'
};
const authParams = new URLSearchParams(window.location.search);
if (authParams.get('error')) {
    setFormMessage(document.querySelector('.auth-form'), authErrorMap[authParams.get('error')] || 'Authentication failed.', 'error');
}
if (resetPasswordForm && !authParams.get('token')) {
    setFormMessage(resetPasswordForm, 'This reset link is missing a token. Please request a new link.', 'error');
    resetPasswordForm.querySelector('button[type="submit"]')?.setAttribute('disabled', 'true');
}

function setFormMessage(form, message, type = 'error') {
    if (!form) return;

    let messageEl = form.querySelector('.auth-message');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.className = 'auth-message';
        form.prepend(messageEl);
    }

    messageEl.textContent = message;
    messageEl.classList.toggle('auth-message-success', type === 'success');
    messageEl.classList.toggle('auth-message-error', type !== 'success');
}

async function handleAuthSubmit(form, action, options = {}) {
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton?.textContent;

    try {
        setFormMessage(form, '', 'success');
        submitButton?.setAttribute('disabled', 'true');
        submitButton?.classList.add('is-loading');
        if (submitButton) submitButton.textContent = 'Please wait...';
        await action();
        if (!options.keepSuccess) {
            setFormMessage(form, '', 'success');
        }
    } catch (error) {
        setFormMessage(form, error.message || 'Something went wrong. Please try again.', 'error');
    } finally {
        submitButton?.removeAttribute('disabled');
        submitButton?.classList.remove('is-loading');
        if (submitButton && originalText) submitButton.textContent = originalText;
    }
}
