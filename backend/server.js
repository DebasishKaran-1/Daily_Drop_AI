require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const path = require('path');
const connectDB = require('./config/db');

// ── Startup Environment Validation ──────────────────────────────
function validateStartupEnv() {
    console.log('\n🔍 DailyDrop — Startup Environment Check');
    console.log('─'.repeat(48));

    const dotenvPath = path.resolve(process.cwd(), '.env');
    const geminiKey = process.env.GEMINI_API_KEY;
    const hasGeminiKey = !!geminiKey;
    const keyLength = geminiKey ? geminiKey.length : 0;

    // Mask key
    let maskedKey = 'N/A';
    if (geminiKey) {
        const start = geminiKey.substring(0, 7);
        const end = geminiKey.substring(geminiKey.length - 4);
        maskedKey = `${start}${'*'.repeat(Math.max(0, geminiKey.length - 11))}${end}`;
    }

    // Initialize Gemini client for checking
    let geminiInitialized = 'NO';
    try {
        const geminiService = require('./services/geminiService');
        const client = geminiService.getGeminiClient();
        if (client) geminiInitialized = 'YES';
    } catch (err) {
        console.error('Error checking Gemini initialization:', err.message);
    }

    console.log(`Dotenv Path: ${dotenvPath}`);
    console.log(`Gemini Key Found: ${hasGeminiKey ? 'YES' : 'NO'}`);
    console.log(`Key Length: ${keyLength}`);
    console.log(`Gemini Client Initialized: ${geminiInitialized}`);
    console.log(`GEMINI_API_KEY: ${maskedKey}`);
    console.log('─'.repeat(48));

    const checks = [
        { name: 'GEMINI_API_KEY',     key: 'GEMINI_API_KEY',     required: true },
        { name: 'GOOGLE_CLIENT_ID',   key: 'GOOGLE_CLIENT_ID',   required: false },
        { name: 'GOOGLE_CLIENT_SECRET', key: 'GOOGLE_CLIENT_SECRET', required: false },
        { name: 'MONGODB_URI',        key: 'MONGODB_URI',        required: true },
        { name: 'JWT_SECRET',         key: 'JWT_SECRET',         required: true },
        { name: 'GNEWS_API_KEY',      key: 'GNEWS_API_KEY',      required: true },
    ];

    let hasCriticalFailure = false;

    checks.forEach(({ name, key, required }) => {
        const value = process.env[key];
        if (value) {
            console.log(`  ✓ ${name} configured`);
        } else if (required) {
            console.error(`  ✗ Missing ${name} (REQUIRED)`);
            if (key === 'GEMINI_API_KEY') {
                console.error("GEMINI_API_KEY missing");
            }
            hasCriticalFailure = true;
        } else {
            console.warn(`  ⚠ Missing ${name} (optional)`);
        }
    });

    // Google OAuth composite check
    const hasGoogleOAuth = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
    if (hasGoogleOAuth) {
        console.log('  ✓ Google OAuth configured');
    } else {
        console.warn('  ⚠ Google OAuth partially configured — social login may not work');
    }

    console.log('─'.repeat(48));

    if (hasCriticalFailure) {
        console.error('❌ Critical environment variables are missing. Server may not function correctly.\n');
    } else {
        console.log('✅ All critical environment variables loaded.\n');
    }
}

validateStartupEnv();

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json());
app.use(cookieParser());

// Enable CORS
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(passport.initialize());

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again soon.'
    }
});

const protectedPages = new Set([
    '/digest.html',
    '/profile.html',
    '/saved.html',
    '/saved-articles.html'
]);

const requirePageAuth = (req, res, next) => {
    if (!protectedPages.has(req.path)) {
        return next();
    }

    const token = req.cookies?.dailydrop_token;
    if (!token || token === 'loggedout') {
        return res.redirect('/signin');
    }

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        return next();
    } catch (error) {
        return res.redirect('/signin');
    }
};

app.get('/signin', (req, res) => {
    res.sendFile(path.join(__dirname, '../signin.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../signup.html'));
});

app.use(requirePageAuth);

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '../')));

const cron = require('node-cron');
const { fetchAndStoreNews } = require('./controllers/newsController');

// Mount routers
app.use('/auth', authLimiter, require('./routes/authRoutes'));
app.use('/news', require('./routes/newsRoutes'));
app.use('/api', require('./routes/apiRoutes'));

// Redirect archive.html (Intelligence page) to digest.html
app.get('/archive.html', (req, res) => {
    res.redirect('/digest.html');
});

// Daily auto-fetch at 8:00 AM
cron.schedule('0 8 * * *', async () => {
    console.log('--- RUNNING SCHEDULED NEWS FETCH ---');
    try {
        await fetchAndStoreNews();
        console.log('Daily news updated successfully');
    } catch (error) {
        console.error('Scheduled news fetch failed:', error);
    }
});

const PORT = process.env.PORT || 5001; // Use 5001 as seen in .env

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
