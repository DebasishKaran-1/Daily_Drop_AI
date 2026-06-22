const mongoose = require('mongoose');
const dotenv = require('dotenv');
const News = require('./models/News');

dotenv.config();

const newsData = [
    {
        category: 'technology',
        title: 'Future of Silicon: RISC-V Gains Momentum',
        description: 'Open source hardware architecture RISC-V is seeing rapid adoption across the tech industry, challenging traditional x86 dominance.',
        content: 'Industry experts predict that RISC-V will dominate the embedded systems market by 2030, with major players already integrating it into high-performance computing.',
        source: { name: 'Tech Insight', url: 'https://example.com/tech-insight' },
        url: 'https://example.com/risc-v-momentum',
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475',
        publishedAt: new Date(),
        importance: 'high'
    },
    {
        category: 'business',
        title: 'Global Markets Stiffen Amid Inflation Fears',
        description: 'Investors are wary as central banks hint at further interest rate hikes to combat stubborn inflation figures.',
        content: 'Major indices dropped 1.5% today as the latest CPI data suggested that monetary tightening might persist longer than previously expected.',
        source: { name: 'Market Watcher', url: 'https://example.com/market-watcher' },
        url: 'https://example.com/global-markets-stiffen',
        image: 'https://images.unsplash.com/photo-1611974717482-48cd92764f6a',
        publishedAt: new Date(),
        importance: 'medium'
    },
    {
        category: 'climate',
        title: 'New Ocean Cooling Patterns Discovered',
        description: 'Scientists identify previously unknown deep-sea currents that play a vital role in regulating global surface temperatures.',
        content: 'The study, published in Nature, highlights how these currents could mitigate some effects of global warming if managed properly through conservation.',
        source: { name: 'Eco Science', url: 'https://example.com/eco-science' },
        url: 'https://example.com/ocean-cooling-patterns',
        image: 'https://images.unsplash.com/photo-1439405326854-014607f694d7',
        publishedAt: new Date(),
        importance: 'medium'
    }
];

const importData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        // await News.deleteMany(); // Preserving old articles as requested
        await News.insertMany(newsData);
        console.log('Mock Data Seeded (Duplicates may error if URL already exists)!');
        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

importData();
