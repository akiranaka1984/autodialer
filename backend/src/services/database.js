const mysql = require('mysql2/promise');
const logger = require('./logger');

let pool;

// データベース接続プールの初期化
const initDb = async (retries = 5, delay = 5000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Docker Composeの環境変数を適切に使用
      pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'mysql', // Dockerコンテナ名に変更
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'password',
        database: process.env.MYSQL_DATABASE || 'autodialer',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4',
        collation: 'utf8mb4_unicode_ci',
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true
      });

      // 接続後に文字セットを設定する追加のクエリ
      await pool.query("SET NAMES utf8mb4");
      await pool.query("SET CHARACTER SET utf8mb4");
      await pool.query("SET character_set_connection=utf8mb4");
      
      // 接続テスト
      await pool.query('SELECT 1');
      
      logger.info('データベース接続プールを作成しました');
      return pool;
    } catch (error) {
      lastError = error;
      logger.warn(`データベース接続試行 ${attempt}/${retries} 失敗: ${error.message}、${delay}ms後に再試行します...`);
      
      // 次の試行まで待機
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  logger.error('データベース接続エラー:', lastError);
  throw lastError;
};

// プールを取得する関数
const getPool = async () => {
  if (!pool) {
    await initDb();
  }
  return pool;
};

// クエリを実行する関数
// クエリを実行する関数
const query = async (sql, params = []) => {
  const conn = await getPool();
  try {
    // LIMIT句を含むSQLの特別な処理
    if (sql.includes('LIMIT ?') && params.length > 0) {
      // 最後のパラメータが数値であることを確認
      const lastParam = params[params.length - 1];
      if (typeof lastParam !== 'number') {
        // LIMIT句のプレースホルダーを直接置換
        sql = sql.replace('LIMIT ?', `LIMIT ${parseInt(lastParam, 10) || 1}`);
        // 最後のパラメータを削除
        params = params.slice(0, -1);
      }
    }
    
    // execute を使用
    logger.debug(`SQL実行: ${sql}, パラメータ: ${JSON.stringify(params)}`);
    const result = await conn.execute(sql, params);
    return result;
  } catch (error) {
    logger.error(`クエリエラー: ${sql}`, error);
    throw error;
  }
};

// トランザクション関連の関数
const beginTransaction = async () => {
  const conn = await getPool();
  const connection = await conn.getConnection();
  await connection.beginTransaction();
  return connection;
};

const commit = async (connection) => {
  await connection.commit();
  connection.release();
};

const rollback = async (connection) => {
  await connection.rollback();
  connection.release();
};

const close = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

module.exports = {
  initDb,
  query,
  beginTransaction,
  commit,
  rollback,
  close,
  getPool
};