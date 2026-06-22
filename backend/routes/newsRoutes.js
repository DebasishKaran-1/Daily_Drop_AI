const express = require('express');
const { getNews, getSingleNews, fetchAndStoreNews } = require('../controllers/newsController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, getNews);
router.post('/fetch', protect, fetchAndStoreNews); // Require authentication to trigger fetch
router.get('/:id', protect, getSingleNews);

module.exports = router;
