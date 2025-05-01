// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// 認証が不要なエンドポイント
router.post('/login', authController.login);

// 認証が必要なエンドポイント
router.use(auth);

// ユーザー登録（管理者専用）
router.post('/register', authController.register);

// プロフィール情報の取得
router.get('/profile', authController.getProfile);

// パスワード変更
router.post('/change-password', authController.changePassword);

// ユーザー一覧取得（管理者専用）
router.get('/users', authController.getAllUsers);

// ユーザーの更新（管理者専用）
router.put('/users/:id', authController.updateUser);

// ユーザーの削除（管理者専用）
router.delete('/users/:id', authController.deleteUser);

module.exports = router;