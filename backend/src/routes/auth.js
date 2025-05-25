// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');


// 認証が不要なエンドポイント
router.post('/login'Controller.login);

// 認証が必要なエンドポイント


// ユーザー登録（管理者専用）
router.post('/register'Controller.register);

// プロフィール情報の取得
router.get('/profile'Controller.getProfile);

// パスワード変更
router.post('/change-password'Controller.changePassword);

// ユーザー一覧取得（管理者専用）
router.get('/users'Controller.getAllUsers);

// ユーザーの更新（管理者専用）
router.put('/users/:id'Controller.updateUser);

// ユーザーの削除（管理者専用）
router.delete('/users/:id'Controller.deleteUser);

module.exports = router;