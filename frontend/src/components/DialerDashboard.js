import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Phone, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Pause, 
  Play,
  RefreshCw,
  Zap
} from 'lucide-react';

const DialerDashboard = () => {
  const [healthData, setHealthData] = useState(null);
  const [realtimeStats, setRealtimeStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const apiBaseUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:5002/api' 
    : '/api';

  // データ取得
  const fetchData = async () => {
    try {
      setError(null);
      
      // ヘルスチェック
      const healthResponse = await fetch(`${apiBaseUrl}/system/health`);
      if (healthResponse.ok) {
        const healthResult = await healthResponse.json();
        setHealthData(healthResult.data);
      }

      // リアルタイム統計
      const statsResponse = await fetch(`${apiBaseUrl}/system/stats/realtime`);
      if (statsResponse.ok) {
        const statsResult = await statsResponse.json();
        setRealtimeStats(statsResult.data);
      }

    } catch (err) {
      console.error('データ取得エラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 初回データ取得
  useEffect(() => {
    fetchData();
  }, []);

  // 自動更新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, 5000); // 5秒ごと
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // 緊急停止
  const handleEmergencyStop = async () => {
    if (!window.confirm('全ての自動発信を緊急停止しますか？')) return;

    try {
      const response = await fetch(`${apiBaseUrl}/system/emergency-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'ダッシュボードからの緊急停止' })
      });

      if (response.ok) {
        alert('緊急停止を実行しました');
        await fetchData();
      } else {
        alert('緊急停止に失敗しました');
      }
    } catch (err) {
      alert(`緊急停止エラー: ${err.message}`);
    }
  };

  // 発信ジョブ手動実行
  const handleManualExecution = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/system/dialer/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        alert('発信ジョブを手動実行しました');
        await fetchData();
      } else {
        alert('手動実行に失敗しました');
      }
    } catch (err) {
      alert(`手動実行エラー: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-3">データを読み込んでいます...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <span>エラー: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">自動発信監視ダッシュボード</h1>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                autoRefresh
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {autoRefresh ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              自動更新
            </button>
            <button
              onClick={fetchData}
              className="flex items-center px-3 py-2 bg-blue-100 text-blue-800 rounded-md text-sm font-medium hover:bg-blue-200"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              更新
            </button>
            <button
              onClick={handleManualExecution}
              className="flex items-center px-3 py-2 bg-purple-100 text-purple-800 rounded-md text-sm font-medium hover:bg-purple-200"
            >
              <Zap className="h-4 w-4 mr-1" />
              手動実行
            </button>
            <button
              onClick={handleEmergencyStop}
              className="flex items-center px-3 py-2 bg-red-100 text-red-800 rounded-md text-sm font-medium hover:bg-red-200"
            >
              <XCircle className="h-4 w-4 mr-1" />
              緊急停止
            </button>
          </div>
        </div>

        {/* システムステータス */}
        {healthData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Activity className="h-8 w-8 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">システム状態</p>
                  <p className="text-lg font-bold text-green-600">
                    {healthData.dialer.initialized ? '正常' : 'エラー'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">アクティブキャンペーン</p>
                  <p className="text-lg font-bold">{healthData.dialer.activeCampaigns.count}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <Phone className="h-8 w-8 text-orange-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">アクティブ通話</p>
                  <p className="text-lg font-bold">{healthData.dialer.activeCalls.count}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">システム稼働時間</p>
                  <p className="text-lg font-bold">
                    {healthData.system?.uptime 
                      ? `${Math.floor(healthData.system.uptime / 3600)}h ${Math.floor((healthData.system.uptime % 3600) / 60)}m`
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* アクティブキャンペーン詳細 */}
        {realtimeStats && realtimeStats.campaigns && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">アクティブキャンペーン詳細</h2>
            
            {realtimeStats.campaigns.length === 0 ? (
              <p className="text-gray-500">アクティブなキャンペーンはありません</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {realtimeStats.campaigns.map((campaign) => (
                  <div key={campaign.campaignId} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-gray-900 truncate">
                        {campaign.campaignName}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        campaign.isActive 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {campaign.isActive ? '稼働中' : '停止中'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">アクティブ通話:</span>
                        <span className="font-medium">
                          {campaign.currentLoad.activeCalls}/{campaign.currentLoad.maxConcurrentCalls}
                        </span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-gray-600">負荷率:</span>
                        <span className="font-medium">{campaign.currentLoad.loadPercentage}%</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-gray-600">未処理:</span>
                        <span className="font-medium">{campaign.contactStats.pending || 0}</span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-gray-600">完了:</span>
                        <span className="font-medium">{campaign.contactStats.completed || 0}</span>
                      </div>
                      
                      {campaign.callStats && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">応答率:</span>
                          <span className="font-medium">
                            {campaign.callStats.total_calls > 0 
                              ? Math.round((campaign.callStats.answered_calls / campaign.callStats.total_calls) * 100)
                              : 0}%
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 負荷バー */}
                    <div className="mt-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-500">負荷状況</span>
                        <span className="text-xs text-gray-500">
                          {campaign.currentLoad.loadPercentage}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all duration-300 ${
                            campaign.currentLoad.loadPercentage >= 80 
                              ? 'bg-red-500'
                              : campaign.currentLoad.loadPercentage >= 60
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${campaign.currentLoad.loadPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* アクティブ通話詳細 */}
        {healthData && healthData.dialer.activeCalls.details.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">アクティブ通話詳細</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      通話ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      キャンペーン
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      通話時間
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {healthData.dialer.activeCalls.details.map((call) => (
                    <tr key={call.callId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {call.callId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {call.campaignId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {call.duration}秒
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {call.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DialerDashboard;
