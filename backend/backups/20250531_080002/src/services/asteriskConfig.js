const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const db = require('./database');

// 設定ファイルパス（Docker環境）
const SIP_CONF_PATH = '/etc/asterisk/sip.conf';
const LOCAL_SIP_CONF_PATH = path.join(__dirname, '../../docker/asterisk-config/sip.conf');

// SIPトランクテンプレート
const SIP_TRUNK_TEMPLATE = `
[trunk-{ID}]
type=peer
host={HOST}
fromdomain={HOST}
fromuser={USERNAME}
username={USERNAME}
secret={PASSWORD}
context=from-trunk
insecure=port,invite
dtmfmode=rfc2833
disallow=all
allow=ulaw
allow=alaw
qualify=yes
`;

// Asterisk設定のリロード
async function reloadAsteriskConfig(asteriskService) {
  try {
    const response = await asteriskService.action('Reload');
    logger.info('Asterisk設定をリロードしました:', response);
    return true;
  } catch (error) {
    logger.error('Asterisk設定リロードエラー:', error);
    return false;
  }
}

// SIP設定の更新
async function updateSipConfig() {
  try {
    // すべてのアクティブな発信者番号を取得
    const [callerIds] = await db.query(
      'SELECT id, number, sip_host, auth_username, auth_password FROM caller_ids WHERE active = true'
    );
    
    if (callerIds.length === 0) {
      logger.warn('アクティブな発信者番号が見つかりません');
      return false;
    }
    
    // 設定ファイルを読み込み
    let sipConfContent;
    try {
      // Docker環境では/etc/asteriskにマウントされるパスを使用
      sipConfContent = await fs.readFile(SIP_CONF_PATH, 'utf8');
    } catch (error) {
      // ローカル開発環境ではプロジェクト内のファイルを使用
      logger.info('Docker環境でのファイル読み込みに失敗、ローカルファイルを使用します:', error);
      sipConfContent = await fs.readFile(LOCAL_SIP_CONF_PATH, 'utf8');
    }
    
    // [general]セクションを保持
    const generalSection = sipConfContent.split('[trunk-')[0];
    
    // 新しい設定を構築
    let newConfig = generalSection;
    
    // 各発信者番号に対応するトランク設定を追加
    callerIds.forEach(callerId => {
      const trunkConfig = SIP_TRUNK_TEMPLATE
        .replace('{ID}', callerId.id)
        .replace(/{HOST}/g, callerId.sip_host)
        .replace(/{USERNAME}/g, callerId.auth_username)
        .replace('{PASSWORD}', callerId.auth_password);
      
      newConfig += trunkConfig;
    });
    
    // エージェント設定は保持する
    const agentSection = sipConfContent.match(/\[agent\][\s\S]*$/);
    if (agentSection) {
      newConfig += agentSection[0];
    }
    
    // 設定ファイルに書き込み
    try {
      await fs.writeFile(SIP_CONF_PATH, newConfig);
    } catch (error) {
      logger.info('Docker環境でのファイル書き込みに失敗、ローカルファイルに書き込みます:', error);
      await fs.writeFile(LOCAL_SIP_CONF_PATH, newConfig);
    }
    
    logger.info('SIP設定を更新しました');
    return true;
  } catch (error) {
    logger.error('SIP設定更新エラー:', error);
    return false;
  }
}

module.exports = {
  reloadAsteriskConfig,
  updateSipConfig
};