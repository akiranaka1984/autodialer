// frontend/src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Phone, Users, Calendar, BarChart2, AlertCircle } from 'lucide-react';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    activeCampaigns: 0,
    totalContacts: 0,
    completedCalls: 0,
    successRate: 0
  });
  const [recentCalls, setRecentCalls] = useState([]);
  const [activeCampaigns, setActiveCampaigns] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // アクティブなキャンペーンを取得
      const campaignsResponse = await fetch('/api/campaigns?status=active', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!campaignsResponse.ok) {
        throw new Error('キャンペーンデータの取得に失敗しました');
      }
      
      const campaignsData = await campaignsResponse.json();
      setActiveCampaigns(campaignsData);
      
      // 最近の通話を取得
      const callsResponse = await fetch('/api/calls?limit=10', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!callsResponse.ok) {
        throw new Error('通話データの取得に失敗しました');
      }
      
      const callsData = await callsResponse.json();
      setRecentCalls(callsData);
      
      // 統計情報を計算
      const statistics = {
        activeCampaigns: campaignsData.length,
        totalContacts: campaignsData.reduce((sum, campaign) => sum + (campaign.contact_count || 0), 0),
        completedCalls: callsData.filter(call => call.status !== 'active').length,
        successRate: calculateSuccessRate(callsData)
      };
      
      setStats(statistics);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 成功率の計算（キーパッド「1」を押した通話の割合）
  const calculateSuccessRate = (calls) => {
    if (calls.length === 0) return 0;
    
    const successfulCalls = calls.filter(call => call.keypress === '1').length;
    return Math.round((successfulCalls / calls.length) * 100);
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
      case 'active':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  // 日付のフォーマット
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // キャンペーンステータスバッジ
  const CampaignStatusBadge = ({ status }) => {
    let color = 'bg-gray-100 text-gray-800';
    
    switch (status) {
      case 'active':
        color = 'bg-green-100 text-green-800';
        break;
      case 'paused':
        color = 'bg-yellow-100 text-yellow-800';
        break;
      case 'draft':
        color = 'bg-blue-100 text-blue-800';
        break;
      case 'completed':
        color = 'bg-gray-100 text-gray-800';
        break;
    }
    
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
        {status === 'active' ? '実行中' : 
         status === 'paused' ? '一時停止' : 
         status === 'draft' ? '下書き' : '完了'}
      </span>
    );
  };

  if (loading) {
    return <div className="text-center p-8">読み込み中...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">ダッシュボード</h1>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-500 mr-4">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">アクティブキャンペーン</p>
              <p className="text-xl font-semibold">{stats.activeCampaigns}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-500 mr-4">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">総連絡先数</p>
              <p className="text-xl font-semibold">{stats.totalContacts}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 text-purple-500 mr-4">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">完了した通話</p>
              <p className="text-xl font-semibold">{stats.completedCalls}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-100 text-yellow-500 mr-4">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">成功率</p>
              <p className="text-xl font-semibold">{stats.successRate}%</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* アクティブキャンペーン */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-8">
        <h2 className="text-lg font-semibold mb-4">アクティブなキャンペーン</h2>
        
        {activeCampaigns.length === 0 ? (
          <p className="text-gray-500">現在アクティブなキャンペーンはありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b text-left">キャンペーン名</th>
                  <th className="py-2 px-4 border-b text-left">発信者番号</th>
                  <th className="py-2 px-4 border-b text-left">ステータス</th>
                  <th className="py-2 px-4 border-b text-left">進捗</th>
                  <th className="py-2 px-4 border-b text-left">実行開始</th>
                </tr>
              </thead>
              <tbody>
                {activeCampaigns.map(campaign => (
                  <tr key={campaign.id}>
                    <td className="py-2 px-4 border-b">{campaign.name}</td>
                    <td className="py-2 px-4 border-b">{campaign.caller_id_number}</td>
                    <td className="py-2 px-4 border-b">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="py-2 px-4 border-b">
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full" 
                          style={{ width: `${campaign.progress || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-500">{campaign.progress || 0}%</span>
                    </td>
                    <td className="py-2 px-4 border-b">{formatDate(campaign.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* 最近の通話 */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <h2 className="text-lg font-semibold mb-4">最近の通話</h2>
        
        {recentCalls.length === 0 ? (
          <p className="text-gray-500">通話履歴がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b text-left">時間</th>
                  <th className="py-2 px-4 border-b text-left">キャンペーン</th>
                  <th className="py-2 px-4 border-b text-left">電話番号</th>
                  <th className="py-2 px-4 border-b text-left">ステータス</th>
                  <th className="py-2 px-4 border-b text-left">通話時間</th>
                  <th className="py-2 px-4 border-b text-left">キー入力</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map(call => (
                  <tr key={call.id}>
                    <td className="py-2 px-4 border-b">{formatDate(call.start_time)}</td>
                    <td className="py-2 px-4 border-b">{call.campaign_name}</td>
                    <td className="py-2 px-4 border-b">{call.contact_phone}</td>
                    <td className={`py-2 px-4 border-b ${getStatusColor(call.status)}`}>
                      {call.status}
                    </td>
                    <td className="py-2 px-4 border-b">{call.duration ? `${call.duration}秒` : '-'}</td>
                    <td className="py-2 px-4 border-b">
                      {call.keypress ? (
                        call.keypress === '1' ? (
                          <span className="text-green-600">オペレーター接続 (1)</span>
                        ) : call.keypress === '9' ? (
                          <span className="text-red-600">着信拒否 (9)</span>
                        ) : (
                          call.keypress
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;