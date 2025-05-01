// backend/src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../services/database');
const logger = require('../services/logger');

// ユーザーログイン
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 入力検証
    if (!username || !password) {
      return res.status(400).json({ message: 'ユーザー名とパスワードは必須です' });
    }
    
    // ユーザーをデータベースから検索
    const users = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(401).json({ message: 'ユーザー名またはパスワードが正しくありません' });
    }
    
    const user = users[0];
    
    // パスワードを検証
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'ユーザー名またはパスワードが正しくありません' });
    }
    
    // JWTトークンを生成
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );
    
    // パスワードフィールドを削除したユーザー情報を返す
    const userResponse = { ...user };
    delete userResponse.password;
    
    // 最終ログイン日時を更新
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    
    // トークンとユーザー情報を返す
    res.json({
      token,
      user: userResponse
    });
  } catch (error) {
    logger.error('ログインエラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// ユーザー登録（管理者専用）
exports.register = async (req, res) => {
  try {
    // 管理者権限を確認
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '管理者権限が必要です' });
    }
    
    const { username, password, name, email, role } = req.body;
    
    // 入力検証
    if (!username || !password) {
      return res.status(400).json({ message: 'ユーザー名とパスワードは必須です' });
    }
    
    // ユーザー名の重複をチェック
    const existingUsers = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }
    
    // パスワードのハッシュ化
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // ユーザーを作成
    const result = await db.query(
      'INSERT INTO users (username, password, name, email, role, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [username, hashedPassword, name || null, email || null, role || 'user']
    );
    
    res.status(201).json({
      message: 'ユーザーが作成されました',
      userId: result.insertId
    });
  } catch (error) {
    logger.error('ユーザー登録エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// プロフィール情報の取得
exports.getProfile = async (req, res) => {
  try {
    // パスワードフィールドを除外したユーザー情報を返す
    const userResponse = { ...req.user };
    delete userResponse.password;
    
    res.json(userResponse);
  } catch (error) {
    logger.error('プロフィール取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// パスワード変更
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // 入力検証
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '現在のパスワードと新しいパスワードは必須です' });
    }
    
    // 現在のパスワードを検証
    const users = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'ユーザーが見つかりません' });
    }
    
    const user = users[0];
    
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: '現在のパスワードが正しくありません' });
    }
    
    // パスワードのハッシュ化
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // パスワードを更新
    await db.query(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, req.user.id]
    );
    
    res.json({ message: 'パスワードが変更されました' });
  } catch (error) {
    logger.error('パスワード変更エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// ユーザー一覧取得（管理者専用）
exports.getAllUsers = async (req, res) => {
  try {
    // 管理者権限を確認
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '管理者権限が必要です' });
    }
    
    // ユーザー一覧を取得（パスワードを除外）
    const users = await db.query(
      'SELECT id, username, name, email, role, created_at, last_login, status FROM users ORDER BY created_at DESC'
    );
    
    res.json(users);
  } catch (error) {
    logger.error('ユーザー一覧取得エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// ユーザーの更新（管理者専用）
exports.updateUser = async (req, res) => {
  try {
    // 管理者権限を確認
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '管理者権限が必要です' });
    }
    
    const userId = req.params.id;
    const { name, email, role, status } = req.body;
    
    // ユーザーの存在確認
    const users = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'ユーザーが見つかりません' });
    }
    
    // ユーザー情報を更新
    await db.query(
      'UPDATE users SET name = ?, email = ?, role = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [name, email, role, status, userId]
    );
    
    res.json({ message: 'ユーザー情報が更新されました' });
  } catch (error) {
    logger.error('ユーザー更新エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};

// ユーザーの削除（管理者専用）
exports.deleteUser = async (req, res) => {
  try {
    // 管理者権限を確認
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '管理者権限が必要です' });
    }
    
    const userId = req.params.id;
    
    // 自分自身を削除しようとしていないか確認
    if (userId === req.user.id.toString()) {
      return res.status(400).json({ message: '自分自身を削除することはできません' });
    }
    
    // ユーザーの存在確認
    const users = await db.query('SELECT id FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'ユーザーが見つかりません' });
    }
    
    // ユーザーを削除
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
    
    res.json({ message: 'ユーザーが削除されました' });
  } catch (error) {
    logger.error('ユーザー削除エラー:', error);
    res.status(500).json({ message: `エラー: ${error.message}` });
  }
};