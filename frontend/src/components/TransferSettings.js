import React, { useState, useEffect } from 'react';
import { Save, Settings, Phone, Plus, X, AlertCircle, Activity, RefreshCw } from 'lucide-react';

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
  // 🚀 NEW: 利用可能SIPアカウント用状態
  const [availableSipAccounts, setAvailableSipAccounts] = useState([]);

  useEffect(() => {
    fetchCampaignInfo();
  }, [campaignId]);

  useEffect(() => {
    if (callerIdId) {
      fetchLoadStatus();
      fetchAvailableSipAccounts(); // 🚀 NEW: 利用可能SIPアカウント取得
      // 5秒ごとに負荷状況を更新
      const interval = setInterval(() => {
        fetchLoadStatus();
        fetchAvailableSipAccounts(); // 🚀 NEW: 定期更新
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

  // 🚀 NEW: 利用可能SIPアカウント取得
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
        await fetchLoadStatus(); // 再読み込み
        await fetchAvailableSipAccounts(); // 🚀 NEW: 利用可能リスト更新
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

  // SIPアカウント削除 - 修正版
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
        await fetchLoadStatus(); // 再読み込み
        await fetchAvailableSipAccounts(); // 🚀 NEW: 利用可能リスト更新
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Settings className="h-5 w-5 mr-2 text-blue-600" />
          <h2 className="text-lg font-semibold">転送設定</h2>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Activity className="h-4 w-4 mr-1" />
          発信者番号ID: {callerIdId}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 ${message.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          <div className="flex items-center">
            {message.includes('✅') ? 
              <Settings className="h-4 w-4 mr-2" /> : 
              <AlertCircle className="h-4 w-4 mr-2" />
            }
            {message}
          </div>
        </div>
      )}

      {/* キー1,2,3の設定 - 簡素化版 */}
      {['1', '2', '3'].map(dtmfKey => (
        <div key={dtmfKey} className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-medium text-gray-800">
              キー{dtmfKey}転送設定
              <span className="ml-3 text-sm text-gray-500">
                ({sipAccounts[dtmfKey]?.length || 0}個のSIP)
              </span>
            </h3>
            <button
              onClick={() => {
                fetchLoadStatus();
                fetchAvailableSipAccounts();
              }}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="更新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* 既存SIPアカウント一覧 - 簡素化版 */}
          <div className="space-y-2 mb-4">
            {sipAccounts[dtmfKey]?.length > 0 ? (
              sipAccounts[dtmfKey].map((account, index) => (
                <div key={`${account.sip_username}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex items-center space-x-3">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{account.sip_username}</span>
                  </div>
                  <button
                    onClick={() => removeSipAccount(account)}
                    disabled={loading || account.current_calls > 0}
                    className={`p-1 rounded ${
                      account.current_calls > 0
                        ? 'text-gray-400 cursor-not-allowed'
                        : 'text-red-500 hover:text-red-700'
                    } disabled:opacity-50`}
                    title={account.current_calls > 0 ? '通話中のため削除できません' : '削除'}
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

          {/* SIPアカウント追加フォーム - 簡素化版 */}
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
          </span>
        </div>
      </div>

      {/* 全体サマリー - 簡素化版 */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium mb-2">転送設定サマリー</h4>
        <div className="grid grid-cols-3 gap-4 text-sm text-center">
          {['1', '2', '3'].map(key => (
            <div key={key} className="bg-white rounded p-3">
              <div className="font-medium text-blue-600">キー{key}</div>
              <div className="text-gray-600">
                {sipAccounts[key]?.length || 0}個のSIP
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TransferSettings;
