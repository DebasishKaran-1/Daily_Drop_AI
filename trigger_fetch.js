require('dotenv').config();
const mongoose = require('mongoose');
const { fetchAndStoreNews } = require('./backend/controllers/newsController');

const triggerFetch = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for manual fetch...');

        await fetchAndStoreNews();

        console.log('Fetch completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Manual fetch failed:', error);
        process.exit(1);
    }
};

triggerFetch();
