// シンプルな認証ミドルウェア
const auth = async (req, res, next) => {
  // 常に認証を通す
  req.user = { id: 1, role: 'admin', name: 'Development Admin' };
  return next();
};

module.exports = auth;
