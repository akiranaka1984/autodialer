// frontend/src/components/TestCall.js
import React, { useState, useEffect } from 'react';
import { Phone, AlertCircle, Check, Info } from 'lucide-react';

const TestCall = () => {
  const [callerIds, setCallerIds] = useState([]);
  const [selectedCallerId, setSelectedCallerId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callStatus, setCallStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [callDetails, setCallDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 環境変数からAPIのベースURLを取得
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  // 発信者番号の一覧を取得
  useEffect(() => {
    const fetchCallerIds = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        // 開発環境でモックデータを使用するオプション
        if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
          console.log('開発環境でモックデータを使用');
          // モックデータのセット
          setTimeout(() => {
            const mockData = [
              { id: 1, number: '0312345678', description: '東京オフィス', active: true },
              { id: 2, number: '0312345679', description: '大阪オフィス', active: true }
            ];
            setCallerIds(mockData);
            if (mockData.length > 0) {
              setSelectedCallerId(mockData[0].id);
            }
            setLoading(false);
          }, 500);
          return;
        }
        
        console.log('API呼び出し:', `${apiBaseUrl}/caller-ids?active=true`);
        
        const response = await fetch(`${apiBaseUrl}/caller-ids?active=true`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('発信者番号の取得に失敗しました');
        }
        
        const data = await response.json();
        setCallerIds(data);
        
        // アクティブな発信者番号が存在する場合は最初の番号を選択
        if (data.length > 0) {
          setSelectedCallerId(data[0].id);
        }
        
        setError(null);
      } catch (err) {
        console.error('API呼び出しエラー:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCallerIds();
  }, [apiBaseUrl]);

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
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - テスト発信');
        // モックデータのセット
        setTimeout(() => {
          const mockCallDetails = {
            callId: `mock-${Date.now()}`,
            success: true,
            message: 'テスト発信が開始されました（モックモード）',
            data: {
              ActionID: `mock-${Date.now()}`,
              Response: 'Success',
              Message: 'Originate successfully queued (MOCK MODE)'
            }
          };
          setCallDetails(mockCallDetails);
          setCallStatus('success');
          setMessage('テスト発信が開始されました（モックモード）');
          
          // 10秒後に通話結果をシミュレーション
          setTimeout(() => {
            setCallDetails(prev => ({
              ...prev,
              status: 'ANSWERED',
              duration: '10秒'
            }));
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
        body: JSON.stringify({
          phoneNumber,
          callerID: selectedCallerId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'テスト発信に失敗しました');
      }
      
      const data = await response.json();
      
      setCallDetails(data);
      setCallStatus('success');
      setMessage('テスト発信が開始されました');
      
      // 発信成功後、10秒後に通話結果を表示（モックモードのシミュレーション）
      setTimeout(() => {
        // 発信状態を更新
        setCallDetails(prev => ({
          ...prev,
          status: 'ANSWERED',
          duration: '10秒'
        }));
      }, 10000);
      
    } catch (error) {
      console.error('テスト発信エラー:', error);
      setCallStatus('error');
      setMessage(`エラー: ${error.message}`);
      setCallDetails(null);
    }
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
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">発信設定</h2>
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
            <div className="flex">
              <Info className="h-5 w-5 text-yellow-600 mr-2" />
              <p className="text-sm text-yellow-700">
                これはテスト機能です。モックモードが有効な場合、実際の発信は行われません。
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  callerIds.map(callerId => (
                    <option key={callerId.id} value={callerId.id}>
                      {callerId.number} - {callerId.description}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
        
        <div className="text-right">
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
                  <dd className="mt-1 text-sm text-gray-900">
                    {callDetails.status || '発信中'}
                  </dd>
                </div>
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">通話時間</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {callDetails.duration || '-'}
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
            実際の発信が行われるかどうかは、システムの設定によって異なります。
          </p>
          <ul className="list-disc pl-5 mb-2 space-y-1">
            <li>発信先電話番号に、テストに使用する電話番号を入力します</li>
            <li>発信者番号から、使用する発信者IDを選択します</li>
            <li>「テスト発信」ボタンをクリックすると発信が開始されます</li>
            <li>発信結果は画面上部に表示されます</li>
          </ul>
          <p>
            <strong>注意:</strong> システムがモックモードで実行されている場合、実際の発信は行われず、
            発信結果がシミュレーションされます。
          </p>
        </div>
      </div>
    </div>
  );
};

export default TestCall;