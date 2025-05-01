// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../services/database');
const logger = require('../services/logger');

const auth = async (req, res, next) => {
  try {
    // ヘッダーからトークンを取得
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '認証が必要です' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: '認証トークンが見つかりません' });
    }
    
    // トークンを検証
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      
      // ユーザー情報をデータベースから取得
      const users = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
      
      if (!users || users.length === 0) {
        return res.status(401).json({ message: 'ユーザーが見つかりません' });
      }
      
      // パスワードフィールドを削除
      const user = { ...users[0] };
      delete user.password;
      
      // リクエストにユーザー情報を付与
      req.user = user;
      
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: '認証トークンの有効期限が切れています' });
      }
      
      return res.status(401).json({ message: '無効な認証トークンです' });
    }
  } catch (error) {
    logger.error('認証エラー:', error);
    res.status(500).json({ message: '認証処理中にエラーが発生しました' });
  }
};

module.exports = auth;