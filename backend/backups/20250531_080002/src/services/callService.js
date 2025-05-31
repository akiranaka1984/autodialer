// src/services/callService.js
const asterisk = require('./asterisk');
const sipService = require('./sipService');
const logger = require('./logger');

class CallService {
  constructor() {
    this.asterisk = asterisk;
    this.sip = sipService;
    this.defaultProvider = process.env.DEFAULT_CALL_PROVIDER || 'sip';
    this.mockMode = process.env.MOCK_ASTERISK === 'true' || process.env.MOCK_SIP === 'true';
    this.enableFallback = process.env.FALLBACK_ENABLED === 'true';
    this.enableLoadBalancing = process.env.LOAD_BALANCING_ENABLED === 'true';
    
    // プロバイダのマッピング
    this.providers = {
      asterisk: this.asterisk,
      sip: this.sip
    };
    
    logger.info(`コールサービスを初期化しました。デフォルトプロバイダ: ${this.defaultProvider}, フォールバック: ${this.enableFallback ? '有効' : '無効'}, モックモード: ${this.mockMode ? '有効' : '無効'}`);
  }
  
  async initialize() {
    try {
      logger.info('コールサービスの初期化を開始します');
      
      // 使用するプロバイダのみ初期化
      const initPromises = [];
      
      // Asteriskの初期化
      initPromises.push(this.asterisk.connect().catch(err => {
        logger.error('Asterisk初期化エラー:', err);
        return false;
      }));
      
      // SIPサービスの初期化
      initPromises.push(this.sip.connect().catch(err => {
        logger.error('SIPサービス初期化エラー:', err);
        return false;
      }));
      
      const results = await Promise.all(initPromises);
      
      // 少なくとも1つのプロバイダが初期化成功していることを確認
      const anySuccess = results.some(result => result === true);
      
      if (!anySuccess) {
        logger.error('すべてのコールプロバイダの初期化に失敗しました');
        return false;
      }
      
      logger.info('コールサービスの初期化が完了しました');
      return true;
    } catch (error) {
      logger.error('コールサービス初期化エラー:', error);
      return false;
    }
  }
  
  async originate(params, preferredProvider = null) {
    const provider = preferredProvider || this.selectProvider(params);
    
    logger.info(`${provider}プロバイダを使用して発信します: ${params.phoneNumber}`);
    
    try {
      // 対応するプロバイダサービスを選択
      const service = this.getProviderService(provider);
      
      if (!service) {
        throw new Error(`不明なプロバイダ: ${provider}`);
      }
      
      // プロバイダがモックモードに対応しているか確認
      if (params.mockMode && typeof service.setMockMode === 'function') {
        service.setMockMode(true);
      }
      
      // 発信実行
      const result = await service.originate(params);
      
      // プロバイダ情報を追加
      result.provider = provider;
      
      // モックモードをリセット（対応している場合）
      if (params.mockMode && typeof service.setMockMode === 'function') {
        service.setMockMode(false);
      }
      
      return result;
    } catch (error) {
      logger.error(`${provider}での発信エラー:`, error);
      
      // フォールバックが有効で、条件に合致する場合は別のプロバイダを試す
      if (this.enableFallback && this.shouldTryFallback(provider, error)) {
        const fallbackProvider = this.getFallbackProvider(provider);
        
        if (fallbackProvider && fallbackProvider !== provider) {
          logger.info(`フォールバックプロバイダを試行: ${fallbackProvider}`);
          
          // フォールバックプロバイダで再試行（再帰呼び出し）
          return this.originate(params, fallbackProvider);
        }
      }
      
      // フォールバックなしまたはフォールバック失敗時はエラーをスロー
      throw error;
    }
  }
  
  getProviderService(provider) {
    return this.providers[provider];
  }
  
  selectProvider(params) {
    // 明示的なプロバイダ指定がある場合はそれを使用
    if (params.provider && this.providers[params.provider]) {
      return params.provider;
    }
    
    // 発信者番号に関連付けられたプロバイダを使用
    if (params.callerIdData && params.callerIdData.provider) {
      const providerName = this.mapProviderName(params.callerIdData.provider);
      if (providerName && this.providers[providerName]) {
        return providerName;
      }
    }
    
    // SIPアカウントが利用可能かチェック
    const sipAvailable = this.sip.connected && 
      (typeof this.sip.getAvailableSipAccountCount === 'function' ? 
       this.sip.getAvailableSipAccountCount() > 0 : true);
       
    if (sipAvailable) {
      return 'sip'; // SIPを優先
    }
    
    // SIPが利用できない場合はAsteriskにフォールバック
    if (this.asterisk.connected) {
      return 'asterisk';
    }
    
    // ロードバランシングが有効な場合
    if (this.enableLoadBalancing) {
      return this.selectProviderWithLoadBalancing();
    }
    
    // どちらも利用できない場合はデフォルト
    return this.defaultProvider;
  }
  
  mapProviderName(providerName) {
    if (!providerName) return null;
    
    const name = providerName.toLowerCase();
    
    if (name.includes('asterisk')) return 'asterisk';
    if (name.includes('sip')) return 'sip';
    
    return null;
  }
  
  shouldTryFallback(provider, error) {
    // フォールバックが無効の場合は試行しない
    if (!this.enableFallback) return false;
    
    // エラーメッセージに基づいてフォールバック条件を判断
    const errorMsg = error.message.toLowerCase();
    
    // リソース不足エラー
    if (errorMsg.includes('アカウント') && 
        (errorMsg.includes('利用可能') || errorMsg.includes('見つかりません'))) {
      return true;
    }
    
    // 接続エラー
    if (errorMsg.includes('接続') && 
        (errorMsg.includes('エラー') || errorMsg.includes('失敗'))) {
      return true;
    }
    
    // タイムアウトエラー
    if (errorMsg.includes('タイムアウト')) {
      return true;
    }
    
    return false;
  }
  
  getFallbackProvider(currentProvider) {
    // 現在のプロバイダに基づいてフォールバック先を決定
    const availableProviders = Object.keys(this.providers).filter(p => 
      p !== currentProvider && this.providers[p].connected);
    
    if (availableProviders.length === 0) {
      return null;
    }
    
    // 優先順位: sip > asterisk
    if (availableProviders.includes('sip')) {
      return 'sip';
    } else if (availableProviders.includes('asterisk')) {
      return 'asterisk';
    }
    
    // デフォルトはリストの最初のプロバイダ
    return availableProviders[0];
  }
  
  selectProviderWithLoadBalancing() {
    // 各プロバイダの現在のアクティブコール数を取得
    const loads = Object.entries(this.providers)
      .filter(([name, service]) => service.connected)
      .map(([name, service]) => {
        const activeCallCount = typeof service.getActiveCallCount === 'function' 
          ? service.getActiveCallCount() 
          : 999; // 不明な場合は高い値
        
        return { provider: name, load: activeCallCount };
      });
    
    if (loads.length === 0) {
      logger.warn('ロードバランシング: 利用可能なプロバイダがありません');
      return this.defaultProvider;
    }
    
    // 負荷の少ないプロバイダを選択
    loads.sort((a, b) => a.load - b.load);
    
    logger.debug(`ロードバランシング: ${loads.map(l => `${l.provider}=${l.load}`).join(', ')}`);
    
    return loads[0].provider;
  }
  
  async handleCallEnd(callId, duration, status, keypress) {
    logger.info(`通話終了処理: callId=${callId}, status=${status}, duration=${duration}`);
    
    try {
      // 各プロバイダに通話終了を通知
      // 通話IDを持つプロバイダが処理する
      
      // 順に各プロバイダをチェック
      for (const [name, service] of Object.entries(this.providers)) {
        // プロバイダが通話IDを持っているか確認
        const hasCall = typeof service.hasCall === 'function' 
          ? await service.hasCall(callId) 
          : false;
        
        if (hasCall) {
          logger.info(`${name}プロバイダで通話終了処理: ${callId}`);
          
          // 対応するプロバイダの通話終了処理を実行
          if (typeof service.handleCallEnd === 'function') {
            return await service.handleCallEnd(callId, duration, status, keypress);
          } else if (typeof service.releaseCallResource === 'function') {
            return await service.releaseCallResource(callId);
          }
          
          // 少なくともcallToAccountMapからエントリを削除
          if (service.callToAccountMap && service.callToAccountMap.delete) {
            service.callToAccountMap.delete(callId);
            logger.info(`${name}の通話リソースを解放: ${callId}`);
            return true;
          }
        }
      }
      
      logger.warn(`通話ID ${callId} に対応するプロバイダが見つかりません`);
      return false;
    } catch (error) {
      logger.error(`通話終了処理エラー: ${error.message}`);
      return false;
    }
  }
  
  // 通話シミュレーション（モックモード用）
  async simulateCallEnd(callId, status = 'ANSWERED', duration = 10) {
    logger.info(`通話終了シミュレーション: callId=${callId}, status=${status}, duration=${duration}`);
    
    // 対応するプロバイダを探す
    for (const [name, service] of Object.entries(this.providers)) {
      if (typeof service.simulateCallEnd === 'function' && 
          typeof service.hasCall === 'function' &&
          await service.hasCall(callId)) {
        
        logger.info(`${name}プロバイダで通話終了シミュレーション実行: ${callId}`);
        return await service.simulateCallEnd(callId, status, duration);
      }
    }
    
    logger.warn(`通話ID ${callId} に対応するプロバイダが見つかりません`);
    return false;
  }
  
  // プロバイダのステータス情報を取得
  getProvidersStatus() {
    return Object.entries(this.providers).map(([name, service]) => ({
      name,
      connected: service.connected === true,
      activeCallCount: typeof service.getActiveCallCount === 'function' 
        ? service.getActiveCallCount() 
        : null,
      mockModeEnabled: service.mockMode === true,
      accounts: typeof service.getAccountStatus === 'function'
        ? service.getAccountStatus()
        : null
    }));
  }
  
  // システムシャットダウン時の処理
  async shutdown() {
    logger.info('コールサービスのシャットダウンを開始します');
    
    // 各プロバイダのシャットダウン
    const shutdownPromises = [];
    
    for (const [name, service] of Object.entries(this.providers)) {
      if (service.connected && typeof service.disconnect === 'function') {
        shutdownPromises.push(service.disconnect().catch(err => {
          logger.error(`${name}プロバイダの切断エラー:`, err);
          return false;
        }));
      }
    }
    
    if (shutdownPromises.length > 0) {
      await Promise.all(shutdownPromises);
    }
    
    logger.info('コールサービスのシャットダウンが完了しました');
    return true;
  }
}

// シングルトンインスタンスの作成
const callService = new CallService();
module.exports = callService;