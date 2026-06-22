const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ['technology', 'business', 'science', 'politics', 'health', 'climate', 'sports', 'general']
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    content: {
        type: String
    },
    source: {
        name: String,
        url: String
    },
    url: {
        type: String,
        unique: true,
        required: true
    },
    image: {
        type: String
    },
    sourceType: {
        type: String,
        enum: ['gnews', 'google_rss', 'hackernews'],
        default: 'gnews'
    },
    publishedAt: {
        type: Date
    },
    importance: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('News', newsSchema);
