// frontend/debug-delete-test.js - フロントエンド削除処理のデバッグ

// CampaignList.jsの削除処理を改良したデバッグ版
const debugCampaignDelete = async (campaignId) => {
  console.log('🔍 フロントエンド削除処理デバッグ開始');
  console.log('削除対象キャンペーンID:', campaignId);
  
  // API URLの確認
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  const deleteUrl = `${apiBaseUrl}/campaigns/${campaignId}`;
  
  console.log('API URL:', deleteUrl);
  console.log('環境変数 REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
  
  try {
    // 認証トークンの確認
    const token = localStorage.getItem('token');
    console.log('認証トークン:', token ? '存在します' : '存在しません');
    
    // プリフライトリクエストの確認
    console.log('🚀 プリフライトリクエスト送信中...');
    const preflightResponse = await fetch(deleteUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': window.location.origin,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });
    
    console.log('プリフライト応答ステータス:', preflightResponse.status);
    console.log('プリフライト応答ヘッダー:', Object.fromEntries(preflightResponse.headers.entries()));
    
    // 実際のDELETEリクエスト
    console.log('🗑️ DELETE リクエスト送信中...');
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'Cache-Control': 'no-cache'
      }
    });
    
    console.log('削除応答ステータス:', deleteResponse.status);
    console.log('削除応答ヘッダー:', Object.fromEntries(deleteResponse.headers.entries()));
    
    // 応答ボディの確認
    const responseText = await deleteResponse.text();
    console.log('応答ボディ (生テキスト):', responseText);
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('応答データ (JSON):', responseData);
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      responseData = { error: 'Invalid JSON response', rawText: responseText };
    }
    
    if (!deleteResponse.ok) {
      throw new Error(`HTTP ${deleteResponse.status}: ${responseData.message || responseText}`);
    }
    
    // 削除後の確認リクエスト
    console.log('✅ 削除成功！確認のため一覧を再取得します...');
    const listResponse = await fetch(`${apiBaseUrl}/campaigns`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (listResponse.ok) {
      const campaigns = await listResponse.json();
      console.log('削除後のキャンペーン一覧:', campaigns);
      
      const stillExists = campaigns.find(c => c.id.toString() === campaignId.toString());
      if (stillExists) {
        console.error('⚠️ 削除したはずのキャンペーンがまだ存在します:', stillExists);
        return { success: false, error: 'キャンペーンが削除されませんでした' };
      } else {
        console.log('✅ キャンペーンが正常に削除されました');
        return { success: true, campaigns };
      }
    } else {
      console.warn('確認用の一覧取得に失敗:', listResponse.status);
      return { success: true, warning: '削除は成功しましたが確認に失敗' };
    }
    
  } catch (error) {
    console.error('❌ 削除処理エラー:', error);
    
    // ネットワークエラーの詳細分析
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('🌐 ネットワークエラー - APIサーバーに接続できません');
      console.error('確認事項:');
      console.error('1. バックエンドサーバーが起動しているか');
      console.error('2. CORS設定が正しいか');
      console.error('3. APIのURLが正しいか');
    }
    
    return { success: false, error: error.message };
  }
};

// ブラウザのコンソールで実行するためのヘルパー関数
window.debugCampaignDelete = debugCampaignDelete;

// 使用方法をコンソールに表示
console.log(`
🔧 フロントエンド削除デバッグ関数が利用可能です:

使用方法:
await debugCampaignDelete(1);  // キャンペーンID 1を削除

このスクリプトをブラウザのコンソールで実行してください。
`);

// 追加: ネットワーク監視関数
const monitorNetworkRequests = () => {
  console.log('🔍 ネットワークリクエスト監視を開始しました');
  
  // fetch API をラップして監視
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [url, options] = args;
    console.log('📡 Fetch リクエスト:', {
      url,
      method: options?.method || 'GET',
      headers: options?.headers,
      body: options?.body
    });
    
    try {
      const response = await originalFetch(...args);
      console.log('📡 Fetch 応答:', {
        url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      return response;
    } catch (error) {
      console.error('📡 Fetch エラー:', { url, error });
      throw error;
    }
  };
  
  console.log('✅ fetch API の監視を設定しました');
};

// 監視開始
monitorNetworkRequests();

export { debugCampaignDelete, monitorNetworkRequests };