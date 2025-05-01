const mysql = require('mysql2/promise');
const logger = require('./logger');

let pool;

const initDb = async () => {
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
    
    logger.info('データベース接続プールを作成しました');
    return pool;
  } catch (error) {
    logger.error('データベース接続エラー:', error);
    throw error;
  }
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
