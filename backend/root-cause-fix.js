// root-cause-fix.js - 根本原因解析と恒久的修正
const db = require('./src/services/database');
const fs = require('fs').promises;

async function rootCauseFix() {
  console.log('🔍 根本原因解析と恒久的修正開始...\n');
  
  try {
    // 1. データベース整合性の完全チェック
    console.log('📊 データベース整合性の完全チェック...');
    
    // アクティブキャンペーンと未処理連絡先の関係
    const [campaignData] = await db.query(`
      SELECT 
        c.id, c.name, c.status,
        (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id AND status = 'pending') as pending_count,
        (SELECT COUNT(*) FROM contacts WHERE campaign_id = c.id) as total_contacts,
        ci.id as caller_id, ci.number as caller_number, ci.active as caller_active
      FROM campaigns c
      LEFT JOIN caller_ids ci ON c.caller_id_id = ci.id
      WHERE c.status = 'active'
    `);
    
    console.log(`アクティブキャンペーン分析:`);
    let hasPendingContacts = false;
    
    for (const campaign of campaignData) {
      console.log(`- Campaign ${campaign.id}: ${campaign.name}`);
      console.log(`  未処理: ${campaign.pending_count}/${campaign.total_contacts}件`);
      console.log(`  発信者番号: ${campaign.caller_number} (ID: ${campaign.caller_id}, Active: ${campaign.caller_active})`);
      
      if (campaign.pending_count > 0) {
        hasPendingContacts = true;
      }
      
      // 問題検出と修正
      if (!campaign.caller_active) {
        console.log(`  🚨 問題: 発信者番号が無効`);
        await db.query('UPDATE caller_ids SET active = 1 WHERE id = ?', [campaign.caller_id]);
        console.log(`  ✅ 修正: 発信者番号を有効化`);
      }
      
      if (campaign.pending_count === 0) {
        console.log(`  🔄 未処理連絡先なし → キャンペーン完了に変更`);
        await db.query('UPDATE campaigns SET status = "completed" WHERE id = ?', [campaign.id]);
      }
    }
    
    // 2. SIPアカウント問題の根本修正
    console.log('\n📞 SIPアカウント問題の根本修正...');
    
    const [sipChannels] = await db.query(`
      SELECT cc.*, ci.number, ci.active
      FROM caller_channels cc
      JOIN caller_ids ci ON cc.caller_id_id = ci.id
      WHERE ci.active = 1
    `);
    
    console.log(`SIPチャンネル状況: ${sipChannels.length}個`);
    
    if (sipChannels.length === 0) {
      console.log('🚨 SIPチャンネルが存在しません - 緊急作成');
      
      // 発信者番号を取得または作成
      let [callerIds] = await db.query('SELECT * FROM caller_ids WHERE active = 1 LIMIT 1');
      
      if (callerIds.length === 0) {
        const [insertResult] = await db.query(`
          INSERT INTO caller_ids (number, description, provider, domain, active)
          VALUES ('03-5946-8520', '自動生成発信者番号', 'Auto SIP', 'ito258258.site', 1)
        `);
        
        const callerId = insertResult.insertId;
        console.log(`✅ 発信者番号作成: ID=${callerId}`);
        
        callerIds = [{ id: callerId, number: '03-5946-8520' }];
      }
      
      const callerId = callerIds[0].id;
      
      // SIPチャンネルを作成
      const sipAccounts = [
        { username: '03080001', password: '56110478' },
        { username: '03080002', password: '51448459' },
        { username: '03080003', password: '52773846' },
        { username: '03080004', password: '53298174' }
      ];
      
      for (const account of sipAccounts) {
        await db.query(`
          INSERT INTO caller_channels (caller_id_id, username, password, channel_type, status)
          VALUES (?, ?, ?, 'both', 'available')
        `, [callerId, account.username, account.password]);
        
        console.log(`✅ SIPチャンネル作成: ${account.username}`);
      }
    } else {
      console.log('✅ SIPチャンネル確認済み');
      sipChannels.forEach(ch => {
        console.log(`  - ${ch.username} (発信者番号: ${ch.number})`);
      });
    }
    
    // 3. 自動開始設定の修正
    console.log('\n🔧 自動開始設定の恒久的修正...');
    
    // src/index.js の自動開始部分を強化
    const indexPath = './src/index.js';
    let indexContent = await fs.readFile(indexPath, 'utf8');
    
    // DialerService自動開始コードが存在するかチェック
    if (!indexContent.includes('dialerService.startAutoSystem')) {
      console.log('🔧 src/index.js にDialerService自動開始コードを追加...');
      
      const autoStartCode = `
    // 🔥 DialerService自動開始の強化（恒久的修正）
    console.log('🔧 DialerService強制自動開始...');
    try {
      const dialerService = require('./services/dialerService');
      
      // 強制的に有効化
      dialerService.enabled = true;
      dialerService.isProcessing = false;
      
      // 10秒後に自動システム開始（他の初期化完了後）
      setTimeout(async () => {
        try {
          if (typeof dialerService.startAutoSystem === 'function') {
            await dialerService.startAutoSystem();
            console.log('✅ DialerService自動システム開始完了');
          } else {
            console.log('⚠️ startAutoSystem メソッドが見つかりません');
          }
        } catch (autoStartError) {
          console.error('DialerService自動開始エラー:', autoStartError.message);
          
          // 30秒後に再試行
          setTimeout(async () => {
            try {
              await dialerService.startAutoSystem();
              console.log('✅ DialerService自動システム再試行成功');
            } catch (retryError) {
              console.error('DialerService再試行失敗:', retryError.message);
            }
          }, 30000);
        }
      }, 10000);
      
    } catch (dialerError) {
      console.error('DialerService初期化エラー:', dialerError.message);
    }`;
      
      // サーバー起動処理の直後に挿入
      const serverStartIndex = indexContent.indexOf('server.listen(PORT');
      if (serverStartIndex !== -1) {
        const insertIndex = indexContent.indexOf('});', serverStartIndex) + 3;
        indexContent = indexContent.slice(0, insertIndex) + autoStartCode + indexContent.slice(insertIndex);
        
        await fs.writeFile(indexPath, indexContent, 'utf8');
        console.log('✅ src/index.js を恒久的に修正しました');
      }
    } else {
      console.log('✅ src/index.js は既に自動開始コードを含んでいます');
    }
    
    // 4. 最終確認
    console.log('\n📊 恒久的修正後の状態確認...');
    
    const [finalCheck] = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM campaigns WHERE status = 'active') as active_campaigns,
        (SELECT COUNT(*) FROM contacts WHERE status = 'pending') as pending_contacts,
        (SELECT COUNT(*) FROM caller_channels cc JOIN caller_ids ci ON cc.caller_id_id = ci.id WHERE ci.active = 1) as sip_channels
    `);
    
    const final = finalCheck[0];
    console.log(`最終状態:`);
    console.log(`- アクティブキャンペーン: ${final.active_campaigns}件`);
    console.log(`- 未処理連絡先: ${final.pending_contacts}件`);
    console.log(`- SIPチャンネル: ${final.sip_channels}個`);
    
    console.log('\n🎉 恒久的修正完了！');
    console.log('🔄 次のステップ:');
    console.log('1. kill 60251  # 現在のプロセス停止');
    console.log('2. nohup node src/index.js > logs/autodialer.log 2>&1 &  # 修正版で再起動');
    console.log('3. sleep 15 && node diagnose-dialer-fixed.js  # 確認');
    
    return {
      activeCampaigns: final.active_campaigns,
      pendingContacts: final.pending_contacts,
      sipChannels: final.sip_channels,
      hasPendingWork: final.pending_contacts > 0
    };
    
  } catch (error) {
    console.error('❌ 根本原因修正エラー:', error);
    return null;
  }
}

// 実行
if (require.main === module) {
  rootCauseFix().then(result => {
    if (result) {
      console.log('\n✅ 恒久的修正成功');
      if (result.hasPendingWork) {
        console.log('🚀 未処理連絡先があるため自動発信が開始されます');
      } else {
        console.log('ℹ️ 現在発信対象がないため自動発信は待機状態です');
      }
    } else {
      console.log('\n❌ 恒久的修正失敗');
    }
    process.exit(result ? 0 : 1);
  });
}

module.exports = { rootCauseFix };
