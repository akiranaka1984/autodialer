// backend/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');
const logger = require('../services/logger');

// API rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分間
  max: 100, // 最大リクエスト数
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded: ${req.ip}`);
    res.status(options.statusCode).json({
      message: 'リクエスト数が多すぎます。しばらく経ってから再試行してください。'
    });
  }
});

module.exports = apiLimiter;