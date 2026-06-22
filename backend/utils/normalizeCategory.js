'use strict';

const CANONICAL = ['technology', 'business', 'science', 'politics', 'health', 'climate', 'sports'];

// Longer multi-word phrases are listed before shorter single words so
// they match first and avoid false positives (e.g. 'solar panel' before 'solar').
const KEYWORD_MAP = {
    technology: [
        'artificial intelligence', 'machine learning', 'open source', 'silicon valley',
        'software', 'hardware', 'developer', 'programming', 'startup', 'chip', 'gpu',
        'robot', 'llm', 'github', 'google', 'apple', 'microsoft', 'meta', 'amazon',
        'nvidia', 'cyber', 'digital', 'internet', 'cloud', 'algorithm', 'tech',
    ],
    business: [
        'interest rate', 'billion dollar', 'hedge fund',
        'market', 'stock', 'invest', 'revenue', 'profit', 'economy', 'trade', 'bank',
        'finance', 'acquisition', 'ipo', 'merger', 'ceo', 'gdp', 'inflation',
        'unemployment', 'enterprise', 'venture capital',
    ],
    science: [
        'quantum physics', 'particle accelerator',
        'research', 'scientist', 'discovery', 'nasa', 'space', 'quantum', 'physics',
        'biology', 'chemistry', 'gene', 'experiment', 'universe', 'telescope',
        'astronomy', 'fossil', 'dinosaur', 'evolution', 'brain',
    ],
    health: [
        'mental health', 'clinical trial', 'public health',
        'medical', 'vaccine', 'hospital', 'cancer', 'disease', 'therapy', 'patient',
        'doctor', 'medicine', 'treatment', 'surgery', 'diabetes', 'obesity',
        'nutrition', 'wellness', 'pandemic', 'drug', 'fda', 'health',
    ],
    climate: [
        'solar panel', 'wind farm', 'fossil fuel', 'electric vehicle', 'global warming',
        'greenhouse gas', 'renewable energy', 'carbon capture',
        'climate', 'carbon', 'emission', 'environment', 'wildfire', 'flood', 'drought',
        'pollution', 'deforestation', 'sustainability', 'green energy',
    ],
    politics: [
        'supreme court', 'white house', 'executive order', 'foreign policy',
        'government', 'congress', 'election', 'president', 'senate', 'legislation',
        'court', 'policy', 'regulation', 'vote', 'political', 'democrat', 'republican',
        'parliament', 'minister', 'diplomat', 'treaty', 'tariff', 'sanction', 'nato',
    ],
    sports: [
        'world cup', 'super bowl',
        'football', 'basketball', 'soccer', 'tennis', 'olympic', 'championship',
        'league', 'cricket', 'fifa', 'tournament', 'stadium', 'athlete', 'player',
        'coach', 'nba', 'nfl', 'sport',
    ],
};

function normalizeCategory(input) {
    if (!input) return 'general';
    const lower = input.toLowerCase().trim();

    if (CANONICAL.includes(lower)) return lower;

    for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
        if (keywords.some(kw => lower.includes(kw))) return cat;
    }

    return 'general';
}

module.exports = normalizeCategory;
