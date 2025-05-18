// backend/src/routes/contacts.js
const express = require('express');
const router = express.Router();
// 相対パスを明示的に
const contactsController = require('../controllers/contactsController');
const auth = require('../middleware/auth');

// すべてのルートで認証ミドルウェアを適用
router.use(auth);

// 連絡先のCSVアップロード
router.post('/upload', contactsController.uploadContacts);

// キャンペーンの連絡先一覧を取得
router.get('/campaign/:campaignId', contactsController.getContactsByCampaign);

// 連絡先詳細の取得
router.get('/:id', contactsController.getContactById);

// 連絡先の更新
router.put('/:id', contactsController.updateContact);

// 連絡先の削除
router.delete('/:id', contactsController.deleteContact);

// 複数の連絡先を削除
router.delete('/', contactsController.deleteMultipleContacts);

// DNCリスト（発信拒否リスト）に登録
router.post('/dnc', contactsController.addToDncList);

// DNCリストを取得
router.get('/dnc/list', contactsController.getDncList);

// DNCリストから削除
router.delete('/dnc/:id', contactsController.removeFromDncList);

module.exports = router;