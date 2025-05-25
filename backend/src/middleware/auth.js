// backend/src/middleware/auth.js - 開発環境用
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

// 開発環境用の簡易認証ミドルウェア
const auth = async (req, res, next) => {
  // 開発環境では常に認証を通す
  req.user = { id: 1, role: 'admin', name: 'Development Admin' };
  logger.debug('開発環境: 認証をスキップしました');
  return next();
};

module.exports = auth;
