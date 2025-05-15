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
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

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
        
        // 開発環境でモックデータを使用するオプション
        if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
          // モックデータ
          setTimeout(() => {
            setProviders([
              { name: 'asterisk', connected: true, activeCallCount: 2 },
              { name: 'sip', connected: true, activeCallCount: 0 },
              { name: 'twilio', connected: false, activeCallCount: 0 }
            ]);
            setLoadingProviders(false);
          }, 500);
          return;
        }
        
        const response = await fetch(`${apiBaseUrl}/calls/providers/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          throw new Error('プロバイダ情報の取得に失敗しました');
        }
        
        const data = await response.json();
        setProviders(data.providers.filter(p => p.connected));
        
      } catch (error) {
        console.error('プロバイダ情報取得エラー:', error);
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

  const fetchCallerIds = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用');
        // モックデータのセット
        setTimeout(() => {
          const mockData = [
            { id: 1, number: '0312345678', description: '東京オフィス', provider: 'SIP Provider A', active: true },
            { id: 2, number: '0312345679', description: '大阪オフィス', provider: 'SIP Provider A', active: true },
            { id: 3, number: '0501234567', description: 'マーケティング部', provider: 'Twilio', active: false }
          ];
          setCallerIds(mockData);
          setLoading(false);
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids`);
      
      const response = await fetch(`${apiBaseUrl}/caller-ids`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('データの取得に失敗しました');
      }
      
      const data = await response.json();
      setCallerIds(data);
      setError(null);
    } catch (err) {
      console.error('API呼び出しエラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCallHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モックデータのセット
        setTimeout(() => {
          const mockHistory = [
            {
              id: 1,
              callId: 'mock-12345',
              phoneNumber: '09012345678',
              callerIdNumber: '0312345678',
              callerIdDescription: '東京オフィス',
              status: 'ANSWERED',
              duration: 12,
              timestamp: new Date(Date.now() - 3600000).toISOString(),
              call_provider: 'asterisk'
            },
            {
              id: 2,
              callId: 'mock-12346',
              phoneNumber: '09023456789',
              callerIdNumber: '0312345679',
              callerIdDescription: '大阪オフィス',
              status: 'NO ANSWER',
              duration: 0,
              timestamp: new Date(Date.now() - 7200000).toISOString(),
              call_provider: 'sip'
            },
            {
              id: 3,
              callId: 'mock-12347',
              phoneNumber: '09034567890',
              callerIdNumber: '0312345678',
              callerIdDescription: '東京オフィス',
              status: 'BUSY',
              duration: 0,
              timestamp: new Date(Date.now() - 86400000).toISOString(),
              call_provider: 'asterisk'
            }
          ];
          setCallHistory(mockHistory);
        }, 800);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/calls/test-history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.warn('テスト発信履歴の取得に失敗しました');
        return;
      }
      
      const data = await response.json();
      setCallHistory(data);
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

  // テスト発信の実行
  const handleTestCall = async () => {
    if (!phoneNumber) {
      setMessage('発信先電話番号を入力してください');
      setCallStatus('error');
      return;
    }

    if (!selectedCallerId) {
      setMessage('発信者番号を選択してください');
      setCallStatus('error');
      return;
    }

    try {
      setCallStatus('loading');
      setMessage('発信中...');
      
      const token = localStorage.getItem('token');
      
      // 送信データを設定
      const data = {
        phoneNumber,
        callerID: selectedCallerId,
        mockMode: mode === 'mock',
        provider: provider || undefined // 空文字列の場合はundefinedにしてパラメータから除外
      };
      
      // API呼び出し前にデバッグ情報を出力
      console.log('送信データ:', data);
      console.log('現在のモード:', mode);
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - テスト発信');
        // モックデータのセット
        setTimeout(() => {
          const selectedProvider = provider || (Math.random() > 0.5 ? 'asterisk' : 'sip');
          const mockCallDetails = {
            callId: `mock-${Date.now()}`,
            success: true,
            message: `テスト発信が開始されました（${selectedProvider}モード）`,
            data: {
              ActionID: `mock-${Date.now()}`,
              Response: 'Success',
              Message: `Originate successfully queued (${selectedProvider.toUpperCase()})`,
              provider: selectedProvider
            }
          };
          setCallDetails(mockCallDetails);
          setCallStatus('success');
          setMessage(`テスト発信が開始されました（${selectedProvider}モード）`);
          
          // 10秒後に通話結果をシミュレーション
          setTimeout(() => {
            setCallDetails(prev => ({
              ...prev,
              status: 'ANSWERED',
              duration: '10秒'
            }));
            
            // 発信履歴に追加
            const selectedCaller = callerIds.find(c => c.id == selectedCallerId);
            setCallHistory(prev => [
              {
                id: Date.now(),
                callId: mockCallDetails.callId,
                phoneNumber: phoneNumber,
                callerIdNumber: selectedCaller?.number || '0312345678',
                callerIdDescription: selectedCaller?.description || '発信者番号',
                status: 'ANSWERED',
                duration: 10,
                timestamp: new Date().toISOString(),
                call_provider: selectedProvider
              },
              ...prev
            ]);
          }, 10000);
        }, 1000);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/calls/test`);
      
      const response = await fetch(`${apiBaseUrl}/calls/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'テスト発信に失敗しました');
      }
      
      const responseData = await response.json();
      
      setCallDetails(responseData);
      setCallStatus('success');
      setMessage(responseData.message || 'テスト発信が開始されました');
      
      // 発信成功後、履歴を更新
      fetchCallHistory();
      
      // 発信成功後、10秒後に通話結果を表示（モックモードのシミュレーション）
      if (mode === 'mock') {
        setTimeout(() => {
          // 発信状態を更新
          setCallDetails(prev => ({
            ...prev,
            status: 'ANSWERED',
            duration: '10秒'
          }));
          
          // 履歴を再取得
          fetchCallHistory();
        }, 10000);
      }
      
    } catch (error) {
      console.error('テスト発信エラー:', error);
      setCallStatus('error');
      setMessage(`エラー: ${error.message}`);
      setCallDetails(null);
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
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="callerId">
              発信者番号 *
            </label>
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
                      {callerId.number} - {callerId.description}
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
                   p.name === 'sip' ? 'SIP直接' : 
                   p.name === 'twilio' ? 'Twilio' : p.name}
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
      
      {/* 発信履歴 */}
      {showHistory && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">テスト発信履歴</h2>
            <button
              onClick={refreshHistory}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              更新
            </button>
          </div>
          
          {callHistory.length === 0 ? (
            <p className="text-gray-500">テスト発信履歴がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      発信日時
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      発信先
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      発信者番号
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      結果
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      通話時間
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      プロバイダ
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {callHistory.map((call) => (
                    <tr key={call.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(call.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {call.phoneNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>{call.callerIdNumber}</div>
                        <div className="text-xs text-gray-500">{call.callerIdDescription}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`${getStatusColor(call.status)}`}>
                          {call.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {call.duration > 0 ? `${call.duration}秒` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`${getProviderColor(call.call_provider)}`}>
                          {getProviderDisplayName(call.call_provider)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {/* 発信結果 */}
      {callStatus !== 'idle' && (
        <div className={`rounded-lg shadow-md p-6 mb-6 ${
          callStatus === 'success' ? 'bg-green-50' : 
          callStatus === 'error' ? 'bg-red-50' : 'bg-gray-50'
        }`}>
          <h2 className="text-lg font-semibold mb-4">発信結果</h2>
          
          <div className={`flex items-center mb-4 ${
            callStatus === 'success' ? 'text-green-600' : 
            callStatus === 'error' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {callStatus === 'success' ? (
              <Check className="h-6 w-6 mr-2" />
            ) : callStatus === 'error' ? (
              <AlertCircle className="h-6 w-6 mr-2" />
            ) : (
              <Phone className="h-6 w-6 mr-2" />
            )}
            <span className="font-medium">{message}</span>
          </div>
          
          {callDetails && (
            <div className="border rounded-md p-4 bg-white">
              <h3 className="text-md font-medium mb-2">通話詳細</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">発信ID</dt>
                  <dd className="mt-1 text-sm text-gray-900">{callDetails.callId}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">発信先</dt>
                  <dd className="mt-1 text-sm text-gray-900">{phoneNumber}</dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">ステータス</dt>
                  <dd className={`mt-1 text-sm ${getStatusColor(callDetails.status || '')}`}>
                    {callDetails.status || '発信中'}
                  </dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">通話時間</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {callDetails.duration || '-'}
                  </dd>
                </div>
                
                {/* 発信者番号情報 */}
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500">発信者番号</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {callerIds.find(c => c.id == selectedCallerId)?.number || '-'} 
                    {callerIds.find(c => c.id == selectedCallerId)?.description ? 
                      ` (${callerIds.find(c => c.id == selectedCallerId)?.description})` : ''}
                  </dd>
                </div>
                
                {/* プロバイダ情報 */}
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">使用プロバイダ</dt>
                  <dd className={`mt-1 text-sm ${getProviderColor(callDetails.data?.provider || '')}`}>
                    {getProviderDisplayName(callDetails.data?.provider || '')}
                  </dd>
                </div>
                
                {callDetails.data && (
                  <div className="sm:col-span-2 mt-2">
                    <details>
                      <summary className="text-sm font-medium text-blue-600 cursor-pointer">
                        詳細データを表示
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-100 p-2 rounded-md overflow-auto">
                        {JSON.stringify(callDetails.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      )}
      
      {/* 使い方ガイド */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold mb-2">テスト発信について</h2>
        <div className="text-sm text-gray-600">
          <p className="mb-2">
            テスト発信機能は、オートコールシステムの設定をテストするためのものです。
            発信モードによって、実際の発信が行われるかどうかが変わります。
          </p>
          <ul className="list-disc pl-5 mb-2 space-y-1">
            <li>発信先電話番号に、テストに使用する電話番号を入力します</li>
            <li>発信者番号から、使用する発信者IDを選択します</li>
            <li>プロバイダを選択します（自動選択の場合はシステムが最適なプロバイダを使用）</li>
            <li>モードを選択します（モックモードでは実発信されません）</li>
            <li>「テスト発信」ボタンをクリックすると発信が開始されます</li>
            <li>発信結果は画面上部に表示されます</li>
            <li>「履歴を表示」をクリックすると、過去のテスト発信結果を確認できます</li>
          </ul>
          <p>
            <strong>注意:</strong> 実際の発信モードでは、Asteriskサーバーの設定に応じて本当に電話がかかります。
            テスト用の電話番号を使用するようにしてください。
          </p>
        </div>
      </div>
    </div>
  );
};

export default TestCall;