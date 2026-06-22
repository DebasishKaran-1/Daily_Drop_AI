const geminiService = require('../services/geminiService');

function normalizeArticle(article = {}) {
    return {
        title: String(article.title || '').trim(),
        description: String(article.description || '').trim(),
        content: String(article.content || '').trim()
    };
}

exports.answerArticleQuestion = async (req, res) => {
    try {
        const article = normalizeArticle(req.body.article);
        const question = String(req.body.question || '').trim();

        if (!article.title && !article.description && !article.content) {
            return res.status(400).json({
                success: false,
                message: 'Article content is required.'
            });
        }

        if (!question) {
            return res.status(400).json({
                success: false,
                message: 'Question is required.'
            });
        }

        try {
            const answer = await geminiService.generateArticleAnswer(article, question);
            res.status(200).json({
                success: true,
                answer
            });
        } catch (apiError) {
            const userMessage = apiError.userMessage || 'AI assistant unavailable. Please try again.';
            const httpStatus = apiError.status === 429 ? 429 : 503;
            return res.status(httpStatus).json({
                success: false,
                message: userMessage
            });
        }
    } catch (error) {
        console.error('Article AI Controller Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to analyze this article. Please try again.'
        });
    }
};
