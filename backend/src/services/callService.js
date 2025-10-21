// src/services/callService.js - bind()エラー修正版（SIP専用）
const sipService = require('./sipService');
const logger = require('./logger');

class CallService {
  constructor() {
    this.sip = sipService;
    this.defaultProvider = 'sip'; // SIP固定
    this.mockMode = process.env.MOCK_SIP === 'true';
    this.enableFallback = false; // SIPのみなのでフォールバック無効
    this.enableLoadBalancing = false; // 単一プロバイダなので無効
    
    // プロバイダのマッピング（SIPのみ）
    this.providers = {
      sip: this.sip
    };
    
    logger.info(`🔧 コールサービス初期化完了: プロバイダ=SIP専用, モックモード=${this.mockMode ? '有効' : '無効'}`);
  }
  
  async initialize() {
    try {
      logger.info('🔧 コールサービス初期化開始（SIP専用）');
      
      // SIPサービスのみ初期化
      const sipResult = await this.sip.connect().catch(err => {
        logger.error('SIP初期化エラー:', err);
        return false;
      });
      
      if (!sipResult) {
        logger.error('❌ SIPサービスの初期化に失敗しました');
        return false;
      }
      
      logger.info('✅ コールサービス初期化完了（SIP）');
      return true;
    } catch (error) {
      logger.error('❌ コールサービス初期化エラー:', error);
      return false;
    }
  }
  
  // 発信メソッド（SIP専用）
  async originate(params, preferredProvider = null) {
    console.log('🚀🚀🚀 CALLSERVICE-START: originateメソッド開始（SIP専用）');
    console.log('🚀🚀🚀 CALLSERVICE-PARAMS:', JSON.stringify(params));
　　
　　  // 🆕 Telnyx使用チェック（最優先）
  if (process.env.USE_TELNYX === 'true' || params.provider === 'telnyx') {
    logger.info('📞 Telnyxで発信を実行');
    const telnyxService = require('./telnyxService');
    return await telnyxService.makeCall(params);
  }
  
  // 既存のSIP発信処理
  logger.info('📞 SIPで発信を実行'); 
    // プロバイダは常にSIP
    const provider = 'sip';
    console.log('🚀🚀🚀 CALLSERVICE-PROVIDER: sip（固定）');
    
    logger.info(`SIPプロバイダで発信: ${params.phoneNumber}`);
    
    try {
      // SIPサービスを取得
      const service = this.sip;
      console.log('🚀🚀🚀 CALLSERVICE-SERVICE: SIPサービス利用可能');
      
      if (!service) {
        throw new Error('SIPサービスが利用できません');
      }
      
      // モックモード設定
      if (params.mockMode && typeof service.setMockMode === 'function') {
        console.log('🚀🚀🚀 CALLSERVICE-MOCK: モックモード設定');
        service.setMockMode(true);
      }
      
      // SIP発信実行
      console.log('🚀🚀🚀 CALLSERVICE-EXEC-1: SIP発信実行直前');
      const result = await service.originate(params);
      console.log('🚀🚀🚀 CALLSERVICE-EXEC-2: SIP発信完了:', result ? 'レスポンスあり' : 'レスポンスなし');
      
      // プロバイダ情報を追加
      if (result) {
        result.provider = 'sip';
      }
      
      // モックモードをリセット
      if (params.mockMode && typeof service.setMockMode === 'function') {
        service.setMockMode(false);
      }
      
      console.log('🚀🚀🚀 CALLSERVICE-SUCCESS: SIP発信成功');
      return result;
    } catch (error) {
      console.log('🚀🚀🚀 CALLSERVICE-ERROR:', error.message);
      logger.error('SIP発信エラー:', error);
      throw error;
    }
  }
  
  getProviderService(provider) {
    // プロバイダはSIPのみ
    return provider === 'sip' ? this.sip : null;
  }
  
selectProvider(params) {
  // パラメータで明示的に指定されている場合
  if (params.provider) {
    return params.provider;
  }
  
  // 環境変数の設定を優先
  if (process.env.DEFAULT_CALL_PROVIDER === 'asterisk') {
    return 'asterisk';
  }
  
  // デフォルトはSIP
  return 'sip';
}
  
  mapProviderName(providerName) {
    // SIPのみサポート
    if (!providerName) return 'sip';
    
    const name = providerName.toLowerCase();
    
    if (name.includes('sip')) return 'sip';
    
    // デフォルトはSIP
    return 'sip';
  }
  
  shouldTryFallback(provider, error) {
    // SIPのみなのでフォールバックなし
    return false;
  }
  
  getFallbackProvider(currentProvider) {
    // フォールバックプロバイダなし
    return null;
  }
  
  selectProviderWithLoadBalancing() {
    // SIPのみなのでロードバランシング不要
    return 'sip';
  }
  
  async handleCallEnd(callId, duration, status, keypress) {
    logger.info(`通話終了処理: callId=${callId}, status=${status}, duration=${duration}`);
    
    try {
      // SIPサービスで通話終了処理
      const service = this.sip;
      
      if (typeof service.hasCall === 'function') {
        const hasCall = await service.hasCall(callId);
        
        if (hasCall) {
          logger.info(`SIPプロバイダで通話終了処理: ${callId}`);
          
          // 通話終了処理を実行
          if (typeof service.handleCallEnd === 'function') {
            return await service.handleCallEnd(callId, duration, status, keypress);
          } else if (typeof service.releaseCallResource === 'function') {
            return await service.releaseCallResource(callId);
          }
          
          // callToAccountMapからエントリを削除
          if (service.callToAccountMap && service.callToAccountMap.delete) {
            service.callToAccountMap.delete(callId);
            logger.info(`SIPの通話リソースを解放: ${callId}`);
            return true;
          }
        }
      }
      
      logger.warn(`通話ID ${callId} がSIPサービスで見つかりません`);
      return false;
    } catch (error) {
      logger.error(`通話終了処理エラー: ${error.message}`);
      return false;
    }
  }
  
  // 通話シミュレーション（モックモード用）
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}`);
    
    const service = this.sip;
    
    if (typeof service.simulateCallEnd === 'function' && 
        typeof service.hasCall === 'function' &&
        await service.hasCall(callId)) {
      
      logger.info(`SIPプロバイダで通話終了シミュレーション実行: ${callId}`);
      return await service.simulateCallEnd(callId, status, duration);
    }
    
    logger.warn(`通話ID ${callId} がSIPサービスで見つかりません`);
    return false;
  }
  
  // プロバイダのステータス情報を取得
  getProvidersStatus() {
    const service = this.sip;
    
    return [{
      name: 'sip',
      connected: service.connected === true,
      activeCallCount: typeof service.getActiveCallCount === 'function' 
        ? service.getActiveCallCount() 
        : null,
      mockModeEnabled: service.mockMode === true,
      accounts: typeof service.getAccountStatus === 'function'
        ? service.getAccountStatus()
        : null
    }];
  }
  
  // システムシャットダウン時の処理
  async shutdown() {
    logger.info('コールサービスのシャットダウンを開始します');
    
    try {
      const service = this.sip;
      
      if (service.connected && typeof service.disconnect === 'function') {
        await service.disconnect();
        logger.info('✅ SIPサービス切断完了');
      }
    } catch (error) {
      logger.error('SIPサービス切断エラー:', error);
    }
    
    logger.info('✅ コールサービスのシャットダウンが完了しました');
    return true;
  }
}

// シングルトンインスタンスの作成
const callService = new CallService();
module.exports = callService;
