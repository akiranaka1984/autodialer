// frontend/src/components/Dashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Users, Calendar, BarChart2, PieChart, Clock, AlertCircle } from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart as RechartsPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

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
  const [callsByDay, setCallsByDay] = useState([]);
  const [callsByHour, setCallsByHour] = useState([]);
  const [callStatus, setCallStatus] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  // 環境変数からAPIのベースURLを取得
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  // ダッシュボードデータの取得
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用');
        
        // モックデータの生成
        setTimeout(() => {
          // 基本統計情報
          setStats({
            activeCampaigns: 2,
            totalContacts: 150,
            completedCalls: 87,
            successRate: 68
          });

          // アクティブなキャンペーン
          setActiveCampaigns([
            {
              id: 1,
              name: 'サマーセール案内',
              status: 'active',
              caller_id_number: '0312345678',
              caller_id_description: '東京オフィス',
              contact_count: 100,
              completed_calls: 45,
              progress: 45,
              started_at: '2025-05-01T09:00:00Z'
            },
            {
              id: 2,
              name: '新規顧客フォローアップ',
              status: 'active',
              caller_id_number: '0312345679',
              caller_id_description: '大阪オフィス',
              contact_count: 50,
              completed_calls: 42,
              progress: 84,
              started_at: '2025-04-28T14:00:00Z'
            }
          ]);

          // 最近の通話
          setRecentCalls([
            {
              id: 1,
              start_time: '2025-05-01T15:30:00Z',
              campaign_name: 'サマーセール案内',
              contact_phone: '09012345678',
              status: 'ANSWERED',
              duration: 45,
              keypress: '1'
            },
            {
              id: 2,
              start_time: '2025-05-01T15:25:00Z',
              campaign_name: 'サマーセール案内',
              contact_phone: '09023456789',
              status: 'NO ANSWER',
              duration: 0,
              keypress: null
            },
            {
              id: 3,
              start_time: '2025-05-01T15:20:00Z',
              campaign_name: '新規顧客フォローアップ',
              contact_phone: '09034567890',
              status: 'ANSWERED',
              duration: 32,
              keypress: '9'
            },
            {
              id: 4,
              start_time: '2025-05-01T15:15:00Z',
              campaign_name: '新規顧客フォローアップ',
              contact_phone: '09045678901',
              status: 'ANSWERED',
              duration: 68,
              keypress: '1'
            },
            {
              id: 5,
              start_time: '2025-05-01T15:10:00Z',
              campaign_name: 'サマーセール案内',
              contact_phone: '09056789012',
              status: 'BUSY',
              duration: 0,
              keypress: null
            }
          ]);

          // 通話ステータスのモックデータ
          setCallStatus([
            { name: '応答', value: 68 },
            { name: '不応答', value: 22 },
            { name: '話中', value: 8 },
            { name: '失敗', value: 2 }
          ]);

          // 日別通話数のモックデータ
          setCallsByDay([
            { date: '4/25', total: 32, answered: 21 },
            { date: '4/26', total: 28, answered: 18 },
            { date: '4/27', total: 15, answered: 10 },
            { date: '4/28', total: 40, answered: 28 },
            { date: '4/29', total: 45, answered: 32 },
            { date: '4/30', total: 50, answered: 38 },
            { date: '5/1', total: 35, answered: 24 }
          ]);

          // 時間帯別通話数のモックデータ
          const hourlyData = [];
          for (let i = 9; i <= 18; i++) {
            hourlyData.push({
              hour: `${i}:00`,
              total: Math.floor(Math.random() * 20) + 5,
              answered: Math.floor(Math.random() * 15) + 3
            });
          }
          setCallsByHour(hourlyData);

          setLoading(false);
        }, 800);
        return;
      }
      
      // 本番環境ではAPIからデータを取得
      console.log('API呼び出し:', `${apiBaseUrl}/stats/dashboard`);
      
      const response = await fetch(`${apiBaseUrl}/stats/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('ダッシュボードデータの取得に失敗しました');
      }
      
      const data = await response.json();
      
      // 基本統計情報を設定
      setStats({
        activeCampaigns: data.active_campaigns || 0,
        totalContacts: data.total_contacts || 0,
        completedCalls: data.completed_calls || 0,
        successRate: data.success_rate || 0
      });
      
      // アクティブキャンペーンの取得
      const campaignsResponse = await fetch(`${apiBaseUrl}/campaigns?status=active`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (campaignsResponse.ok) {
        const campaignsData = await campaignsResponse.json();
        setActiveCampaigns(campaignsData);
      }
      
      // 最近の通話履歴の取得
      const callsResponse = await fetch(`${apiBaseUrl}/calls?limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (callsResponse.ok) {
        const callsData = await callsResponse.json();
        setRecentCalls(callsData);
      }
      
      // 統計データの取得
      const statsResponse = await fetch(`${apiBaseUrl}/stats/calls?period=${selectedPeriod}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        
        // 通話ステータスの設定
        const statusData = [
          { name: '応答', value: statsData.total.answered || 0 },
          { name: '不応答', value: statsData.total.no_answer || 0 },
          { name: '話中', value: statsData.total.busy || 0 },
          { name: '失敗', value: statsData.total.failed || 0 }
        ];
        setCallStatus(statusData);
        
        // 日別データの設定
        setCallsByDay(statsData.daily.map(item => ({
          date: formatDateShort(item.date),
          total: item.total,
          answered: item.answered
        })));
        
        // 時間帯別データの設定
        setCallsByHour(statsData.hourly.map(item => ({
          hour: `${item.hour}:00`,
          total: item.total,
          answered: item.answered
        })));
      }
      
      setError(null);
    } catch (err) {
      console.error('ダッシュボードデータ取得エラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, selectedPeriod]);

  // コンポーネントマウント時にデータ取得
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // 期間選択の変更ハンドラ
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
  };

  // 日付のフォーマット（短い形式）
  const formatDateShort = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 日付のフォーマット（詳細）
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
      default:
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

  // PIEチャートの色
  const COLORS = ['#0088FE', '#FF8042', '#FFBB28', '#FF0000'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="mt-2 text-gray-600">読み込み中...</span>
        </div>
      </div>
    );
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
      
      {/* グラフセクション */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 日別通話グラフ */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">日別通話数</h2>
            <div className="flex space-x-2">
              <button 
                onClick={() => handlePeriodChange('week')}
                className={`px-2 py-1 text-xs rounded ${
                  selectedPeriod === 'week' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                週間
              </button>
              <button 
                onClick={() => handlePeriodChange('month')}
                className={`px-2 py-1 text-xs rounded ${
                  selectedPeriod === 'month' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                月間
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={callsByDay}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name="総通話数" fill="#8884d8" />
              <Bar dataKey="answered" name="応答数" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* 通話ステータス円グラフ */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-lg font-semibold mb-4">通話結果の分布</h2>
          <ResponsiveContainer width="100%" height={250}>
            <RechartsPieChart>
              <Pie
                data={callStatus}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {callStatus.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
        
        {/* 時間帯別通話グラフ */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-lg font-semibold mb-4">時間帯別通話数</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={callsByHour}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="総通話数" stroke="#8884d8" activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="answered" name="応答数" stroke="#82ca9d" />
            </LineChart>
          </ResponsiveContainer>
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