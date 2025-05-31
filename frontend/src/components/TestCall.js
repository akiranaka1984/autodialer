// frontend/src/components/TestCall.js
import React, { useState, useEffect } from 'react';
import { Phone, AlertCircle, Check, Info, Clock, List, RefreshCw, X } from 'lucide-react';

const TestCall = () => {
  const [callerIds, setCallerIds] = useState([]);
  const [selectedCallerId, setSelectedCallerId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callStatus, setCallStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [callDetails, setCallDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [callHistory, setCallHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState(localStorage.getItem('callTestMode') || 'mock');
  const [provider, setProvider] = useState('');
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // 環境変数からAPIのベースURLを取得
  //const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
  console.log('API URL:', apiBaseUrl);

  // モード切り替えハンドラ
  const toggleMode = () => {
    const newMode = mode === 'mock' ? 'real' : 'mock';
    setMode(newMode);
    localStorage.setItem('callTestMode', newMode);
  };

  // プロバイダ情報を取得
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoadingProviders(true);
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${apiBaseUrl}/calls/providers/status`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache' 
          }
        });
        
        if (!response.ok) {
          console.error('プロバイダ情報取得エラー:', response.status);
          // エラー時も最低限のプロバイダ情報を設定
          setProviders([
            { name: 'asterisk', connected: true, activeCallCount: 0 },
            { name: 'sip', connected: true, activeCallCount: 0 }
          ]);
          return;
        }
        
        const data = await response.json();
        setProviders(data.providers?.filter(p => p.connected) || []);
        
      } catch (error) {
        console.error('プロバイダ情報取得エラー:', error);
        // エラー時も最低限のプロバイダ情報を設定
        setProviders([
          { name: 'asterisk', connected: true, activeCallCount: 0 },
          { name: 'sip', connected: true, activeCallCount: 0 }
        ]);
      } finally {
        setLoadingProviders(false);
      }
    };
    
    fetchProviders();
  }, [apiBaseUrl]);

  // 発信者番号の一覧を取得
  useEffect(() => {
    fetchCallerIds();
  }, [apiBaseUrl]);
  
  // テスト発信履歴も取得
  useEffect(() => {
    fetchCallHistory();
  }, [apiBaseUrl]);

  // fetchCallerIds関数の修正例
  const fetchCallerIds = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('発信者番号を取得中...');
      
      // デバッグ用の情報
      console.log('API URL:', `${apiBaseUrl}/caller-ids`);
      console.log('認証トークン:', localStorage.getItem('token') ? '存在します' : '存在しません');
      
      let response;
      try {
        // テスト用エンドポイントを試す
        response = await fetch(`${apiBaseUrl}/caller-ids`);
      } catch (fetchError) {
        console.error('テスト用エンドポイント呼び出しエラー:', fetchError);
        
        // 環境変数に基づいてモックデータの使用を決定
        if (process.env.REACT_APP_USE_MOCK_DATA === 'true') {
          console.log('モックデータを使用します');
          setCallerIds([
            { id: 1, number: '0312345678', description: '東京オフィス', provider: 'SIP Provider A', active: true },
            { id: 2, number: '0312345679', description: '大阪オフィス', provider: 'SIP Provider A', active: true },
            { id: 3, number: '0501234567', description: 'マーケティング部', provider: 'Twilio', active: true }
          ]);
        } else {
          console.log('モックデータは無効化されています');
          setCallerIds([]); // 空の配列を設定
          setError('発信者番号の取得に失敗しました。管理画面から登録してください。');
        }
        setLoading(false);
        return;
      }
      
      // レスポンス処理
      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('発信者番号データ:', data);
      
      if (!Array.isArray(data)) {
        console.warn('API応答が配列ではありません:', data);
        setCallerIds([]);
        setError('サーバーから無効なデータが返されました');
      } else if (data.length === 0) {
        setCallerIds([]);
        setError('発信者番号が登録されていません。発信者番号管理から登録してください。');
      } else {
        const activeCallerIds = data.filter(callerId => callerId.active);
        setCallerIds(activeCallerIds);
        
        if (activeCallerIds.length === 0) {
          setError('有効な発信者番号がありません。発信者番号管理から有効な番号を登録してください。');
        }
      }
    } catch (err) {
      console.error('発信者番号取得エラー:', err);
      setError(err.message);
      
      // 環境変数に基づいてモックデータの使用を決定
      if (process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        console.log('エラー時にモックデータを使用します');
        setCallerIds([
          { id: 1, number: '0312345678', description: '東京オフィス', provider: 'SIP Provider A', active: true },
          { id: 2, number: '0312345679', description: '大阪オフィス', provider: 'SIP Provider A', active: true },
          { id: 3, number: '0501234567', description: 'マーケティング部', provider: 'Twilio', active: true }
        ]);
      } else {
        console.log('モックデータは無効化されています - APIエラー時も実データのみ使用');
        setCallerIds([]); // 空の配列を設定
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCallHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${apiBaseUrl}/calls?test_call=true&limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.warn(`テスト発信履歴の取得に失敗しました (${response.status})`);
        return;
      }
      
      const data = await response.json();
      
      // データ構造に応じて適切に変換
      const historyData = data.calls || data || [];
      setCallHistory(historyData);
    } catch (err) {
      console.error('テスト発信履歴取得エラー:', err);
    }
  };

  // 電話番号の入力処理
  const handlePhoneNumberChange = (e) => {
    // 数字以外の文字（ハイフンなど）を許可しない
    const input = e.target.value.replace(/[^\d]/g, '');
    setPhoneNumber(input);
  };

  // 発信者番号の変更処理
  const handleCallerIdChange = (e) => {
    setSelectedCallerId(e.target.value);
  };

  // frontend/src/components/TestCall.js の handleTestCall 関数を修正

  const handleTestCall = async () => {
    // === 動作確認用デバッグコード ===
    console.log('🔥 テスト発信ボタンがクリックされました！');
    alert('テスト発信ボタンがクリックされました！'); // ポップアップで確認
    
    // 入力値の確認
    console.log('📞 発信先電話番号:', phoneNumber);
    console.log('📱 選択された発信者番号ID:', selectedCallerId);
    console.log('🌐 API URL:', apiBaseUrl);
    console.log('⚙️ モード:', mode);
    
    if (!phoneNumber) {
      console.log('❌ 電話番号が未入力です');
      setMessage('発信先電話番号を入力してください');
      setCallStatus('error');
      return;
    }
  
    if (!selectedCallerId) {
      console.log('❌ 発信者番号が未選択です');
      setMessage('発信者番号を選択してください');
      setCallStatus('error');
      return;
    }
  
    try {
      setCallStatus('loading');
      setMessage('発信中...');
      
      console.log('🚀 APIリクエスト開始');
      
      // 送信データを設定
      const data = {
        phoneNumber,
        callerID: selectedCallerId,
        mockMode: mode === 'mock',
        provider: provider || undefined
      };
      
      console.log('📤 送信データ:', data);
      console.log('🌍 APIエンドポイント:', `${apiBaseUrl}/calls/test`);
      
      const response = await fetch(`${apiBaseUrl}/calls/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dummy-token'
        },
        body: JSON.stringify(data)
      });
      
      console.log('📥 レスポンス受信:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log('❌ エラーレスポンス:', errorData);
        throw new Error(errorData.message || `テスト発信に失敗しました (${response.status})`);
      }
      
      const responseData = await response.json();
      console.log('✅ 成功レスポンス:', responseData);
      
      setCallDetails(responseData);
      setCallStatus('success');
      setMessage(responseData.message || 'テスト発信が開始されました');
      
      alert('テスト発信が成功しました！'); // 成功時のポップアップ
      
    } catch (error) {
      console.error('🔥 テスト発信エラー:', error);
      setCallStatus('error');
      setMessage(`エラー: ${error.message}`);
      setCallDetails(null);
      
      alert(`テスト発信エラー: ${error.message}`); // エラー時のポップアップ
    }
  };
  
  // 通話ステータスに基づく色を取得
  const getStatusColor = (status) => {
    switch (status) {
      case 'ANSWERED':
        return 'text-green-600';
      case 'BUSY':
        return 'text-yellow-600';
      case 'NO ANSWER':
        return 'text-red-600';
      case 'FAILED':
        return 'text-red-800';
      default:
        return 'text-gray-600';
    }
  };
  
  // プロバイダに基づく色を取得
  const getProviderColor = (provider) => {
    switch (provider) {
      case 'asterisk':
        return 'text-blue-600';
      case 'sip':
        return 'text-purple-600';
      case 'twilio':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };
  
  // プロバイダの表示名を取得
  const getProviderDisplayName = (provider) => {
    switch (provider) {
      case 'asterisk':
        return 'Asterisk';
      case 'sip':
        return 'SIP直接';
      case 'twilio':
        return 'Twilio';
      default:
        return provider || '不明';
    }
  };
  
  // 日時のフォーマット
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };
  
  // 履歴のトグル
  const toggleHistory = () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      fetchCallHistory();
    }
  };
  
  // 履歴の更新
  const refreshHistory = () => {
    fetchCallHistory();
  };

  // 発信者番号データの再取得
  const refreshCallerIds = () => {
    fetchCallerIds();
  };

  if (loading) {
    return <div className="text-center p-8">読み込み中...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">テスト発信</h1>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
            <button 
              onClick={refreshCallerIds}
              className="ml-auto text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              再読み込み
            </button>
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">発信設定</h2>
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-600">モード:</span>
            <button
              onClick={toggleMode}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                mode === 'mock'
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              }`}
            >
              {mode === 'mock' ? 'モックモード' : '実際の発信'}
            </button>
          </div>
        </div>
        
        {mode === 'mock' && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <div className="flex">
              <Info className="h-5 w-5 text-yellow-600 mr-2" />
              <p className="text-sm text-yellow-700">
                モックモードでは実際の発信は行われず、発信結果がシミュレーションされます。
              </p>
            </div>
          </div>
        )}
        
        {mode === 'real' && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
            <div className="flex">
              <Info className="h-5 w-5 text-blue-600 mr-2" />
              <p className="text-sm text-blue-700">
                <strong>注意:</strong> 実際の発信モードでは、本当に電話がかかります。テスト用の電話番号を使用してください。
              </p>
            </div>
          </div>
        )}
          
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="phoneNumber">
              発信先電話番号 *
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="phoneNumber"
                id="phoneNumber"
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 pr-12 sm:text-sm border-gray-300 rounded-md"
                placeholder="例: 09012345678"
                value={phoneNumber}
                onChange={handlePhoneNumberChange}
                maxLength={15}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">ハイフンなしで入力してください</p>
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="callerId">
                発信者番号 *
              </label>
              <button
                onClick={refreshCallerIds}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                更新
              </button>
            </div>
            <select
              id="callerId"
              name="callerId"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              value={selectedCallerId}
              onChange={handleCallerIdChange}
            >
              {callerIds.length === 0 ? (
                <option value="">有効な発信者番号がありません</option>
              ) : (
                <>
                  <option value="">発信者番号を選択</option>
                  {callerIds.map(callerId => (
                    <option key={callerId.id} value={callerId.id}>
                      {callerId.number} - {callerId.description || '説明なし'}
                      {callerId.provider ? ` (${callerId.provider})` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              プロバイダ選択
            </label>
            <select
              id="provider"
              name="provider"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={loadingProviders}
            >
              <option value="">自動選択</option>
              {providers.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name === 'asterisk' ? 'Asterisk' : 
                  p.name === 'sip' ? 'SIP直接' : p.name}
                  {p.activeCallCount !== null ? ` (アクティブ: ${p.activeCallCount})` : ''}
                </option>
              ))}
            </select>
            {loadingProviders && (
              <p className="mt-1 text-xs text-gray-500">プロバイダ情報を読み込み中...</p>
            )}
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={toggleHistory}
            className="flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {showHistory ? (
              <>
                <X className="h-5 w-5 mr-1" />
                履歴を閉じる
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 mr-1" />
                履歴を表示
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={handleTestCall}
            disabled={callStatus === 'loading' || !phoneNumber || !selectedCallerId}
            className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              (callStatus === 'loading' || !phoneNumber || !selectedCallerId) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {callStatus === 'loading' ? '発信中...' : 'テスト発信'}
          </button>
        </div>
      </div>
      
      {/* 以下略（元のコードと同じ） */}
      {/* ... 履歴表示、発信結果、使い方ガイドのコードは変更なし ... */}
    </div>
  );
};

export default TestCall;