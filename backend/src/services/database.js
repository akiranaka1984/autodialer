// backend/src/services/database.js - 500エラー修正版
const mysql = require('mysql2/promise');
const logger = require('./logger');

let pool;

// データベース接続プールの初期化
const initDb = async (retries = 5, delay = 5000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`データベース接続試行 ${attempt}/${retries}...`);
      
      // Docker Composeの環境変数を適切に使用
      pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'mysql',
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
        dateStrings: true,
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true
      });

      // 接続後に文字セットを設定する追加のクエリ
      await pool.query("SET NAMES utf8mb4");
      await pool.query("SET CHARACTER SET utf8mb4");
      await pool.query("SET character_set_connection=utf8mb4");
      
      // 接続テスト
      const [rows] = await pool.query('SELECT 1 as test');
      console.log('データベース接続テスト成功:', rows);
      
      logger.info('データベース接続プールを作成しました');
      return pool;
    } catch (error) {
      lastError = error;
      console.error(`データベース接続試行 ${attempt}/${retries} 失敗:`, error.message);
      logger.warn(`データベース接続試行 ${attempt}/${retries} 失敗: ${error.message}、${delay}ms後に再試行します...`);
      
      // 最後の試行でなければ待機
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('データベース接続エラー:', lastError);
  logger.error('データベース接続エラー:', lastError);
  throw lastError;
};

// プールを取得する関数
const getPool = async () => {
  if (!pool) {
    console.log('プールが存在しないため再初期化します');
    await initDb();
  }
  return pool;
};

// クエリを実行する関数（エラーハンドリング強化）
const query = async (sql, params = []) => {
  let conn;
  try {
    conn = await getPool();
    
    console.log(`SQL実行: ${sql.substring(0, 100)}...`, params.length > 0 ? `パラメータ数: ${params.length}` : '');
    
    // クエリ実行
    const result = await conn.query(sql, params);
    
    console.log(`SQL実行成功: 結果行数=${Array.isArray(result[0]) ? result[0].length : '不明'}`);
    
    return result;
  } catch (error) {
    console.error(`クエリエラー詳細:`, {
      sql: sql.substring(0, 200),
      params: params,
      error: error.message,
      code: error.code,
      errno: error.errno
    });
    
    logger.error(`クエリエラー: ${sql.substring(0, 100)}...`, error);
    
    // 接続エラーの場合はプールをリセット
    if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT') {
      console.log('接続エラーのためプールをリセットします');
      pool = null;
    }
    
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
    console.log('データベースプールを閉じています...');
    await pool.end();
    pool = null;
    console.log('データベースプールを閉じました');
  }
};

// ヘルスチェック関数
const healthCheck = async () => {
  try {
    const [rows] = await query('SELECT 1 as healthy, NOW() as timestamp');
    return {
      healthy: true,
      timestamp: rows[0].timestamp,
      poolState: pool ? 'active' : 'inactive'
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      poolState: pool ? 'active' : 'inactive'
    };
  }
};

module.exports = {
  initDb,
  query,
  beginTransaction,
  commit,
  rollback,
  close,
  getPool,
  healthCheck
};