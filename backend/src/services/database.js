const mysql = require('mysql2/promise');
const logger = require('./logger');

let pool;

// database.js内のinitDb関数を修正
const initDb = async (retries = 5, delay = 5000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'password',
        database: process.env.MYSQL_DATABASE || 'autodialer',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      
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

const getPool = async () => {
  if (!pool) {
    await initDb();
  }
  return pool;
};

const query = async (sql, params = []) => {
  const conn = await getPool();
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } catch (error) {
    logger.error(`クエリエラー: ${sql}`, error);
    throw error;
  }
};

module.exports = {
  initDb,
  query
};
