// backend/debug-campaign-delete.js - キャンペーン削除のデバッグスクリプト

const mysql = require('mysql2/promise');
const express = require('express');
const cors = require('cors');

// デバッグ用の簡易サーバー
const app = express();
app.use(cors());
app.use(express.json());

// データベース接続
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 13306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'password',
  database: process.env.MYSQL_DATABASE || 'autodialer'
};

async function debugCampaignDelete() {
  console.log('🔍 キャンペーン削除のデバッグを開始します...');
  
  let connection;
  try {
    // データベース接続
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ データベース接続成功');
    
    // 現在のキャンペーン一覧を表示
    const [campaigns] = await connection.query('SELECT id, name, status, created_at FROM campaigns ORDER BY id');
    console.log('\n📋 現在のキャンペーン一覧:');
    console.table(campaigns);
    
    if (campaigns.length === 0) {
      console.log('⚠️ キャンペーンが存在しません。テスト用データを作成してください。');
      return;
    }
    
    // テスト用のキャンペーン削除エンドポイント
    app.delete('/api/campaigns/:id', async (req, res) => {
      const campaignId = req.params.id;
      console.log(`\n🗑️ 削除リクエスト受信: キャンペーンID = ${campaignId}`);
      
      try {
        // トランザクション開始
        await connection.beginTransaction();
        console.log('📝 トランザクション開始');
        
        // 関連データの削除順序
        const deleteQueries = [
          { query: 'DELETE FROM call_logs WHERE campaign_id = ?', name: '通話ログ' },
          { query: 'DELETE FROM contacts WHERE campaign_id = ?', name: '連絡先' },
          { query: 'DELETE FROM campaign_audio WHERE campaign_id = ?', name: '音声設定' },
          { query: 'DELETE FROM campaign_ivr_config WHERE campaign_id = ?', name: 'IVR設定' },
          { query: 'DELETE FROM campaigns WHERE id = ?', name: 'キャンペーン' }
        ];
        
        let totalDeleted = 0;
        
        for (const { query, name } of deleteQueries) {
          try {
            const [result] = await connection.query(query, [campaignId]);
            console.log(`  ✅ ${name}削除: ${result.affectedRows}件`);
            totalDeleted += result.affectedRows;
          } catch (err) {
            // テーブルが存在しない場合は無視
            if (err.code === 'ER_NO_SUCH_TABLE') {
              console.log(`  ⚠️ ${name}テーブルが存在しません（スキップ）`);
            } else {
              throw err;
            }
          }
        }
        
        if (totalDeleted === 0) {
          await connection.rollback();
          console.log('❌ 削除対象が見つかりませんでした');
          return res.status(404).json({ 
            message: 'キャンペーンが見つかりません',
            campaignId: campaignId
          });
        }
        
        // コミット
        await connection.commit();
        console.log('✅ 削除完了・コミット成功');
        
        // 削除後の状態を確認
        const [remainingCampaigns] = await connection.query('SELECT id, name FROM campaigns ORDER BY id');
        console.log('\n📋 削除後のキャンペーン一覧:');
        console.table(remainingCampaigns);
        
        res.json({ 
          success: true, 
          message: `キャンペーン ${campaignId} を削除しました`,
          deletedRows: totalDeleted,
          remaining: remainingCampaigns
        });
        
      } catch (error) {
        await connection.rollback();
        console.error('❌ 削除エラー:', error);
        res.status(500).json({ 
          success: false, 
          message: '削除に失敗しました', 
          error: error.message 
        });
      }
    });
    
    // キャンペーン一覧取得エンドポイント
    app.get('/api/campaigns', async (req, res) => {
      try {
        const [campaigns] = await connection.query(`
          SELECT c.*, 
                 ci.number as caller_id_number,
                 ci.description as caller_id_description
          FROM campaigns c
          LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
          ORDER BY c.created_at DESC
        `);
        
        console.log(`📋 キャンペーン一覧取得: ${campaigns.length}件`);
        res.json(campaigns);
      } catch (error) {
        console.error('❌ 一覧取得エラー:', error);
        res.status(500).json({ message: error.message });
      }
    });
    
    // プリフライトリクエスト対応
    app.options('*', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.sendStatus(200);
    });
    
    // サーバー起動
    const PORT = 5002; // 通常のAPIサーバーと区別
    app.listen(PORT, () => {
      console.log(`\n🚀 デバッグサーバー起動: http://localhost:${PORT}`);
      console.log('\n💡 テスト方法:');
      console.log(`curl -X DELETE http://localhost:${PORT}/api/campaigns/1`);
      console.log(`curl -X GET http://localhost:${PORT}/api/campaigns`);
      console.log('\n⚠️ このサーバーは停止するまで実行し続けます。Ctrl+C で停止してください。');
    });
    
  } catch (error) {
    console.error('❌ デバッグスクリプトエラー:', error);
    if (connection) {
      await connection.end();
    }
  }
}

// 実行
debugCampaignDelete().catch(console.error);

// 終了処理
process.on('SIGINT', async () => {
  console.log('\n🛑 デバッグサーバーを終了します...');
  process.exit(0);
});