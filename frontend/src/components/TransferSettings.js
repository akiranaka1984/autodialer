import React, { useState, useEffect } from 'react';
import { Save, Settings, Phone, Plus, X, AlertCircle, Activity, RefreshCw, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || '/api';
};

const TransferSettings = ({ campaignId }) => {
  const [loading, setLoading] = useState(false);
  const [callerIdId, setCallerIdId] = useState(null);
  const [loadStatus, setLoadStatus] = useState(null);
  const [sipAccounts, setSipAccounts] = useState({
    '1': [],
    '2': [],
    '3': []
  });
  const [message, setMessage] = useState('');
  const [newSipInputs, setNewSipInputs] = useState({
    '1': '',
    '2': '',
    '3': ''
  });
  const [availableSipAccounts, setAvailableSipAccounts] = useState([]);
  
  // 🆕 Phase2.2: 通話数診断・リセット機能
  const [callCountsDiagnosis, setCallCountsDiagnosis] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    fetchCampaignInfo();
  }, [campaignId]);

  useEffect(() => {
    if (callerIdId) {
      fetchLoadStatus();
      fetchAvailableSipAccounts();
      fetchCallCountsDiagnosis(); // 🆕 診断情報取得
      
      // 5秒ごとに負荷状況・診断情報を更新
      const interval = setInterval(() => {
        fetchLoadStatus();
        fetchAvailableSipAccounts();
        fetchCallCountsDiagnosis(); // 🆕 定期診断
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [callerIdId]);

  // キャンペーン情報から発信者番号ID取得
  const fetchCampaignInfo = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/campaigns/${campaignId}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const campaign = await response.json();
        setCallerIdId(campaign.caller_id_id);
        console.log('発信者番号ID取得:', campaign.caller_id_id);
      }
    } catch (error) {
      console.error('キャンペーン情報取得エラー:', error);
      setMessage('❌ キャンペーン情報の取得に失敗しました');
    }
  };

  // 負荷状況とSIPアカウント一覧取得
  const fetchLoadStatus = async () => {
    if (!callerIdId) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/load-status/${callerIdId}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLoadStatus(data);
        
        // SIPアカウントをキー別に整理
        const organizedAccounts = { '1': [], '2': [], '3': [] };
        data.accounts.forEach(account => {
          if (organizedAccounts[account.dtmf_key]) {
            organizedAccounts[account.dtmf_key].push(account);
          }
        });
        setSipAccounts(organizedAccounts);
        
        console.log('負荷状況取得:', data);
      }
    } catch (error) {
      console.error('負荷状況取得エラー:', error);
    }
  };

  // 利用可能SIPアカウント取得
  const fetchAvailableSipAccounts = async () => {
    if (!callerIdId) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/available-sip-accounts/${callerIdId}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableSipAccounts(data.accounts || []);
        console.log('利用可能SIPアカウント取得:', data.accounts?.length || 0, '個');
      }
    } catch (error) {
      console.error('利用可能SIPアカウント取得エラー:', error);
      setAvailableSipAccounts([]);
    }
  };

  // 🆕 通話数診断情報取得
  const fetchCallCountsDiagnosis = async () => {
    if (!callerIdId) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/call-counts-diagnosis/${callerIdId}`, {
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCallCountsDiagnosis(data);
      }
    } catch (error) {
      console.error('診断情報取得エラー:', error);
    }
  };

  // 🔄 通話数リセット機能
  const resetCallCounts = async () => {
    if (!callerIdId) {
      setMessage('❌ 発信者番号IDが取得できません');
      return;
    }
    
    if (!window.confirm('全ての通話数をリセットしますか？\n\n⚠️ 現在進行中の通話には影響しませんが、通話数カウンターがリセットされます。')) {
      return;
    }
    
    setResetLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/reset-call-counts/${callerIdId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ ${data.data.resetCount}個のSIPアカウントの通話数をリセットしました`);
        
        // 全ての状況を即座に更新
        await fetchLoadStatus();
        await fetchCallCountsDiagnosis();
      } else {
        const errorData = await response.json();
        setMessage('❌ リセットエラー: ' + errorData.message);
      }
    } catch (error) {
      setMessage('❌ リセットエラー: ' + error.message);
    } finally {
      setResetLoading(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // 🚨 緊急全体リセット
  const resetAllCallCounts = async () => {
    if (!window.confirm('🚨 システム全体の通話数をリセットしますか？\n\n⚠️ この操作は全ての発信者番号に影響します。\n本当に実行しますか？')) {
      return;
    }
    
    setResetLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/reset-all-call-counts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`🚨 システム全体で${data.data.globalResetCount}個のSIPアカウントをリセットしました`);
        await fetchLoadStatus();
        await fetchCallCountsDiagnosis();
      } else {
        const errorData = await response.json();
        setMessage('❌ 全体リセットエラー: ' + errorData.message);
      }
    } catch (error) {
      setMessage('❌ 全体リセットエラー: ' + error.message);
    } finally {
      setResetLoading(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  // SIPアカウント追加
  const addSipAccount = async (dtmfKey) => {
    const sipUsername = newSipInputs[dtmfKey].trim();
    
    if (!sipUsername) {
      setMessage('❌ SIPアカウントを選択してください');
      return;
    }

    // 重複チェック
    const allAccounts = [...sipAccounts['1'], ...sipAccounts['2'], ...sipAccounts['3']];
    if (allAccounts.some(acc => acc.sip_username === sipUsername)) {
      setMessage('❌ このSIPアカウントは既に他のキーで使用されています');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/sip-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          caller_id_id: callerIdId,
          dtmf_key: dtmfKey,
          sip_username: sipUsername,
          priority: sipAccounts[dtmfKey].length + 1,
          max_concurrent_calls: 5
        })
      });

      if (response.ok) {
        setMessage(`✅ キー${dtmfKey}にSIPアカウント ${sipUsername} を追加しました`);
        setNewSipInputs(prev => ({ ...prev, [dtmfKey]: '' }));
        await fetchLoadStatus();
        await fetchAvailableSipAccounts();
        await fetchCallCountsDiagnosis(); // 🆕 診断情報更新
      } else {
        const errorData = await response.json();
        setMessage('❌ ' + errorData.message);
      }
    } catch (error) {
      setMessage('❌ 追加エラー: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // SIPアカウント削除
  const removeSipAccount = async (account) => {
    if (!window.confirm(`キー${account.dtmf_key}から ${account.sip_username} を削除しますか？`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/transfer/sip-accounts/${account.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setMessage(`✅ キー${account.dtmf_key}から ${account.sip_username} を削除しました`);
        await fetchLoadStatus();
        await fetchAvailableSipAccounts();
        await fetchCallCountsDiagnosis(); // 🆕 診断情報更新
      } else {
        const errorData = await response.json();
        setMessage('❌ ' + errorData.message);
      }
    } catch (error) {
      setMessage('❌ 削除エラー: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // 全データ更新
  const refreshAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchLoadStatus(),
        fetchAvailableSipAccounts(),
        fetchCallCountsDiagnosis()
      ]);
      setMessage('✅ データを更新しました');
      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      setMessage('❌ 更新エラー: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!callerIdId) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
            <p className="text-gray-600">キャンペーン情報を読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* ヘッダー部分 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Settings className="h-5 w-5 mr-2 text-blue-600" />
          <h2 className="text-lg font-semibold">転送設定</h2>
        </div>
        
        {/* 🆕 Phase2.2: 通話数リセットボタン群 */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center text-sm text-gray-600 mr-3">
            <Activity className="h-4 w-4 mr-1" />
            発信者番号ID: {callerIdId}
          </div>
          
          <button
            onClick={refreshAllData}
            disabled={loading}
            className="flex items-center px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            更新
          </button>
          
          <button
            onClick={resetCallCounts}
            disabled={resetLoading || !callerIdId}
            className="flex items-center px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${resetLoading ? 'animate-spin' : ''}`} />
            通話数リセット
          </button>
          
          <button
            onClick={resetAllCallCounts}
            disabled={resetLoading}
            className="flex items-center px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
          >
            <Zap className="h-4 w-4 mr-1" />
            全体リセット
          </button>
        </div>
      </div>

      {/* 🆕 通話数診断表示 */}
      {callCountsDiagnosis && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-3">通話数状況診断</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{callCountsDiagnosis.summary.totalSipAccounts}</div>
              <div className="text-xs text-gray-500">総SIP数</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{callCountsDiagnosis.summary.busyAccounts}</div>
              <div className="text-xs text-gray-500">使用中</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{callCountsDiagnosis.summary.overflowAccounts}</div>
              <div className="text-xs text-gray-500">異常</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{callCountsDiagnosis.summary.totalActiveCalls}</div>
              <div className="text-xs text-gray-500">総通話数</div>
            </div>
          </div>
          
          {callCountsDiagnosis.summary.needsReset ? (
            <div className="flex items-center text-orange-600 text-sm">
              <AlertTriangle className="h-4 w-4 mr-1" />
              通話数のリセットが必要です
            </div>
          ) : (
            <div className="flex items-center text-green-600 text-sm">
              <CheckCircle className="h-4 w-4 mr-1" />
              全ての通話数が正常です
            </div>
          )}
        </div>
      )}

      {message && (
        <div className={`p-3 rounded mb-4 ${message.includes('✅') || message.includes('🚨') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          <div className="flex items-center">
            {message.includes('✅') || message.includes('🚨') ? 
              <CheckCircle className="h-4 w-4 mr-2" /> : 
              <AlertCircle className="h-4 w-4 mr-2" />
            }
            {message}
          </div>
        </div>
      )}

      {/* キー1,2,3の設定 */}
      {['1', '2', '3'].map(dtmfKey => (
        <div key={dtmfKey} className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-medium text-gray-800">
              キー{dtmfKey}転送設定
              <span className="ml-3 text-sm text-gray-500">
                ({sipAccounts[dtmfKey]?.length || 0}個のSIP)
              </span>
            </h3>
          </div>

          {/* 既存SIPアカウント一覧 - 通話数表示付き */}
          <div className="space-y-2 mb-4">
            {sipAccounts[dtmfKey]?.length > 0 ? (
              sipAccounts[dtmfKey].map((account, index) => (
                <div key={`${account.sip_username}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center space-x-3">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{account.sip_username}</span>
                    {/* 🆕 通話数表示 */}
                    <span className={`text-xs px-2 py-1 rounded ${
                      account.current_calls > 0 
                        ? account.current_calls > account.max_concurrent_calls 
                          ? 'bg-red-100 text-red-700' 
                          : 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {account.current_calls}/{account.max_concurrent_calls}
                    </span>
                  </div>
                  <button
                    onClick={() => removeSipAccount(account)}
                    disabled={loading || account.current_calls > 0}
                    className={`p-1 rounded ${
                      account.current_calls > 0
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-red-500 hover:text-red-700'
                    } disabled:opacity-50`}
                    title={account.current_calls > 0 ? '通話中のため削除できません - リセットボタンをお試しください' : '削除'}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed">
                キー{dtmfKey}にはSIPアカウントが設定されていません
              </div>
            )}
          </div>

          {/* SIPアカウント追加フォーム */}
          <div className="flex items-center space-x-2">
            <select
              value={newSipInputs[dtmfKey]}
              onChange={(e) => setNewSipInputs(prev => ({ ...prev, [dtmfKey]: e.target.value }))}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="">
                SIPアカウントを選択してください ({availableSipAccounts.length}個利用可能)
              </option>
              {availableSipAccounts.map(account => (
                <option key={account.sip_username} value={account.sip_username}>
                  {account.sip_username}
                </option>
              ))}
            </select>
            <button
              onClick={() => addSipAccount(dtmfKey)}
              disabled={loading || !newSipInputs[dtmfKey]}
              className="flex items-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 mr-1" />
              追加
            </button>
          </div>
        </div>
      ))}

      {/* DNC注意書き */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center text-sm text-blue-800">
          <AlertCircle className="h-4 w-4 mr-2" />
          <span>
            <strong>キー9:</strong> DNC登録（自動設定済み）
            <br />
            <strong>負荷分散機能:</strong> 各キーで複数のSIPアカウントが自動選択されます
            <br />
            <strong>通話数管理:</strong> 通話開始時に自動増加、終了時に自動減少します
          </span>
        </div>
      </div>

      {/* 全体サマリー */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium mb-2">転送設定サマリー</h4>
        <div className="grid grid-cols-3 gap-4 text-sm text-center">
          {['1', '2', '3'].map(key => {
            const accounts = sipAccounts[key] || [];
            const totalCalls = accounts.reduce((sum, acc) => sum + acc.current_calls, 0);
            const totalCapacity = accounts.reduce((sum, acc) => sum + acc.max_concurrent_calls, 0);
            
            return (
              <div key={key} className="bg-white rounded p-3">
                <div className="font-medium text-blue-600">キー{key}</div>
                <div className="text-gray-600">
                  {accounts.length}個のSIP
                </div>
                <div className="text-xs text-gray-500">
                  {totalCalls}/{totalCapacity} 通話中
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TransferSettings;
