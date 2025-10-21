// src/services/telnyxService.js
const telnyx = require('telnyx');
const logger = require('./logger');

class TelnyxService {
  constructor() {
    // 環境変数から設定を読み込み
    this.apiKey = process.env.TELNYX_API_KEY;
    this.connectionId = process.env.TELNYX_CONNECTION_ID;
    this.phoneNumber = process.env.TELNYX_PHONE_NUMBER;
    this.enabled = process.env.USE_TELNYX === 'true';
    
    // Telnyxクライアントを初期化
    if (this.apiKey) {
      this.client = telnyx(this.apiKey);
      logger.info('✅ TelnyxService初期化成功');
      logger.info(`📞 Telnyx有効状態: ${this.enabled ? '有効' : '無効'}`);
    } else {
      logger.warn('⚠️ TELNYX_API_KEYが設定されていません');
    }
  }

  /**
   * 電話を発信する
   */
  async makeCall(params) {
    const { phoneNumber, campaignId = 0, contactId = 0 } = params;
    
    // Telnyxが無効の場合
    if (!this.enabled) {
      logger.info('📴 Telnyx無効: USE_TELNYX=false');
      return { 
        success: false, 
        message: 'Telnyx is disabled' 
      };
    }
    
    // 必須パラメータチェック
    if (!this.connectionId || !this.phoneNumber) {
      logger.error('❌ Telnyx設定不足: CONNECTION_IDまたはPHONE_NUMBERが未設定');
      return {
        success: false,
        error: 'Telnyx configuration incomplete'
      };
    }
    
    try {
      // 電話番号を国際形式に変換
      const toNumber = this.formatPhoneNumber(phoneNumber);
      
      logger.info(`📞 Telnyx発信開始: ${toNumber}`);
      logger.info(`   キャンペーンID: ${campaignId}, 連絡先ID: ${contactId}`);
      
      // Telnyx APIで発信
      const call = await this.client.calls.create({
        connection_id: this.connectionId,
        to: toNumber,
        from: this.phoneNumber,
        webhook_url: `${process.env.BASE_URL || 'http://localhost:5000'}/api/telnyx/webhook`
      });
      
      logger.info(`✅ Telnyx発信成功: CallID=${call.call_control_id}`);
      
      return {
        success: true,
        callId: call.call_control_id,
        provider: 'telnyx',
        details: {
          to: toNumber,
          from: this.phoneNumber,
          connectionId: this.connectionId
        }
      };
      
    } catch (error) {
      logger.error('❌ Telnyx発信エラー:', error.message);
      
      // エラー詳細をログ
      if (error.response) {
        logger.error('   APIレスポンス:', error.response.data);
      }
      
      return {
        success: false,
        error: error.message,
        provider: 'telnyx'
      };
    }
  }
  
  /**
   * 電話番号を国際形式にフォーマット
   */
  formatPhoneNumber(phone) {
    // 既に+で始まっている場合はそのまま
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // 日本の番号の場合（0で始まる）
    if (phone.startsWith('0')) {
      return '+81' + phone.substring(1);
    }
    
    // フィリピンの番号の場合（9で始まる）
    if (phone.startsWith('9')) {
      return '+63' + phone;
    }
    
    // その他（数字のみの場合は+を付ける）
    return '+' + phone.replace(/\D/g, '');
  }
  
  /**
   * 通話を切断
   */
  async hangup(callId) {
    if (!this.enabled) {
      return { success: false, message: 'Telnyx disabled' };
    }
    
    try {
      logger.info(`📴 Telnyx通話切断: CallID=${callId}`);
      
      await this.client.calls.hangup(callId);
      
      logger.info(`✅ Telnyx通話切断成功`);
      
      return { success: true };
      
    } catch (error) {
      logger.error('❌ Telnyx切断エラー:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  /**
   * DTMFトーンを送信
   */
  async sendDTMF(callId, digits) {
    if (!this.enabled) {
      return { success: false, message: 'Telnyx disabled' };
    }
    
    try {
      logger.info(`🔢 DTMF送信: CallID=${callId}, Digits=${digits}`);
      
      await this.client.calls.sendDTMF(callId, { digits });
      
      logger.info(`✅ DTMF送信成功`);
      
      return { success: true };
      
    } catch (error) {
      logger.error('❌ DTMF送信エラー:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  /**
   * 音声を再生
   */
  async playAudio(callId, audioUrl) {
    if (!this.enabled) {
      return { success: false, message: 'Telnyx disabled' };
    }
    
    try {
      logger.info(`🎵 音声再生: CallID=${callId}, URL=${audioUrl}`);
      
      await this.client.calls.playAudio(callId, {
        audio_url: audioUrl
      });
      
      logger.info(`✅ 音声再生開始成功`);
      
      return { success: true };
      
    } catch (error) {
      logger.error('❌ 音声再生エラー:', error.message);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

// シングルトンとしてエクスポート
module.exports = new TelnyxService();
