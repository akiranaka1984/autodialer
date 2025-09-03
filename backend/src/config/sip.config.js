// SIPドメイン設定
// Asteriskのpjsip設定と同期する必要があります
module.exports = {
  // プライマリドメイン
  domain: process.env.SIP_DOMAIN || 'pantex.online',
  
  // その他のSIP関連設定
  realm: 'asterisk',
  
  // ドメインを動的に取得するヘルパー関数
  getDomain: function() {
    return this.domain;
  }
};
