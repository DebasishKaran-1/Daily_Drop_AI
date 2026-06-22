const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { answerArticleQuestion } = require('../controllers/articleAIController');

const router = express.Router();

router.post('/article-ai', protect, answerArticleQuestion);

module.exports = router;
