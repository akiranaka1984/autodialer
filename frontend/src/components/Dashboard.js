// frontend/src/components/Dashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Users, Calendar, BarChart2, PieChart, Clock, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, PieChart as RechartsPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    activeCampaigns: 0,
    totalContacts: 0,
    completedCalls: 0,
    successRate: 0,
    todayCalls: 0,
    weeklyCallsChange: 0,
    answerRateChange: 0
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
        
        // モックデータのセット
        setTimeout(() => {
          // 基本統計情報
          setStats({
            activeCampaigns: 3,
            totalContacts: 450,
            completedCalls: 287,
            successRate: 72,
            todayCalls: 45,
            weeklyCallsChange: 15,
            answerRateChange: -5
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
              started_at: '2025-05-01T09:00:00Z',
              answerRate: 75
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
              started_at: '2025-04-28T14:00:00Z',
              answerRate: 68
            },
            {
              id: 3,
              name: '顧客満足度調査',
              status: 'active',
              caller_id_number: '0501234567',
              caller_id_description: 'マーケティング部',
              contact_count: 75,
              completed_calls: 30,
              progress: 40,
              started_at: '2025-05-02T10:00:00Z',
              answerRate: 82
            }
          ]);

          // 最近の通話
          setRecentCalls([
            {
              id: 1,
              start_time: '2025-05-05T15:30:00Z',
              campaign_name: 'サマーセール案内',
              contact_phone: '09012345678',
              contact_name: '山田太郎',
              status: 'ANSWERED',
              duration: 45,
              keypress: '1'
            },
            {
              id: 2,
              start_time: '2025-05-05T15:25:00Z',
              campaign_name: 'サマーセール案内',
              contact_phone: '09023456789',
              contact_name: '佐藤花子',
              status: 'NO ANSWER',
              duration: 0,
              keypress: null
            },
            {
              id: 3,
              start_time: '2025-05-05T15:20:00Z',
              campaign_name: '新規顧客フォローアップ',
              contact_phone: '09034567890',
              contact_name: '鈴木一郎',
              status: 'ANSWERED',
              duration: 32,
              keypress: '9'
            },
            {
              id: 4,
              start_time: '2025-05-05T15:15:00Z',
              campaign_name: '顧客満足度調査',
              contact_phone: '09045678901',
              contact_name: '高橋次郎',
              status: 'ANSWERED',
              duration: 68,
              keypress: '1'
            },
            {
              id: 5,
              start_time: '2025-05-05T15:10:00Z',
              campaign_name: 'サマーセール案内',
              contact_phone: '09056789012',
              contact_name: '田中三郎',
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
            { date: '4/29', total: 42, answered: 28 },
            { date: '4/30', total: 38, answered: 25 },
            { date: '5/1', total: 45, answered: 32 },
            { date: '5/2', total: 52, answered: 38 },
            { date: '5/3', total: 48, answered: 35 },
            { date: '5/4', total: 55, answered: 42 },
            { date: '5/5', total: 45, answered: 32 }
          ]);

          // 時間帯別通話数のモックデータ
          setCallsByHour([
            { hour: '9:00', total: 15, answered: 12 },
            { hour: '10:00', total: 22, answered: 18 },
            { hour: '11:00', total: 25, answered: 20 },
            { hour: '12:00', total: 12, answered: 8 },
            { hour: '13:00', total: 18, answered: 14 },
            { hour: '14:00', total: 24, answered: 19 },
            { hour: '15:00', total: 28, answered: 22 },
            { hour: '16:00', total: 26, answered: 20 },
            { hour: '17:00', total: 20, answered: 15 },
            { hour: '18:00', total: 15, answered: 11 }
          ]);

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
      
      // データの設定
      setStats(data.stats);
      setActiveCampaigns(data.activeCampaigns);
      setRecentCalls(data.recentCalls);
      setCallStatus(data.callStatus);
      setCallsByDay(data.callsByDay);
      setCallsByHour(data.callsByHour);
      
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
    
    // 5分ごとにデータを更新
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // 期間選択の変更ハンドラ
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
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

  // 通話ステータスに基づく色
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <div className="space-x-2">
          <Link
            to="/campaigns/new"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            新規キャンペーン
          </Link>
          <Link
            to="/reports"
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            詳細レポート
          </Link>
        </div>
      </div>
      
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
          <div className="flex items-center justify-between">
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
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between">
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
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100 text-purple-500 mr-4">
                <Phone className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">本日の通話数</p>
                <p className="text-xl font-semibold">{stats.todayCalls}</p>
              </div>
            </div>
            <div className={`flex items-center ${stats.weeklyCallsChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.weeklyCallsChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="text-sm ml-1">{Math.abs(stats.weeklyCallsChange)}%</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-yellow-100 text-yellow-500 mr-4">
                <BarChart2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">応答率</p>
                <p className="text-xl font-semibold">{stats.successRate}%</p>
              </div>
            </div>
            <div className={`flex items-center ${stats.answerRateChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.answerRateChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span className="text-sm ml-1">{Math.abs(stats.answerRateChange)}%</span>
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
                className={`px-3 py-1 rounded text-sm ${
                  selectedPeriod === 'week' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                週間
              </button>
              <button 
                onClick={() => handlePeriodChange('month')}
                className={`px-3 py-1 rounded text-sm ${
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
      </div>
      
      {/* 時間帯別通話グラフ */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-8">
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
      
      {/* アクティブキャンペーン */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">アクティブなキャンペーン</h2>
          <Link to="/campaigns" className="text-blue-600 hover:text-blue-800">
            すべて表示
          </Link>
        </div>
        
        {activeCampaigns.length === 0 ? (
          <p className="text-gray-500">現在アクティブなキャンペーンはありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キャンペーン名</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">進捗</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">応答率</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">開始日時</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {activeCampaigns.map(campaign => (
                  <tr key={campaign.id}>
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-gray-900">{campaign.name}</div>
                      <div className="text-sm text-gray-500">{campaign.caller_id_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                          <div 
                            className="bg-blue-600 h-2.5 rounded-full" 
                            style={{ width: `${campaign.progress || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">{campaign.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-900">{campaign.answerRate}%</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{formatDate(campaign.started_at)}</td>
                    <td className="py-3 px-4">
                      <Link
                        to={`/campaigns/${campaign.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* 最近の通話 */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">最近の通話</h2>
          <Link to="/calls" className="text-blue-600 hover:text-blue-800">
            すべて表示
          </Link>
        </div>
        
        {recentCalls.length === 0 ? (
          <p className="text-gray-500">通話履歴がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">時間</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キャンペーン</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">連絡先</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">通話時間</th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キー入力</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentCalls.map(call => (
                  <tr key={call.id}>
                    <td className="py-3 px-4 text-sm text-gray-500">{formatDate(call.start_time)}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{call.campaign_name}</td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-gray-900">{call.contact_phone}</div>
                      <div className="text-sm text-gray-500">{call.contact_name || '-'}</div>
                    </td>
                    <td className={`py-3 px-4 text-sm ${getStatusColor(call.status)}`}>
                      {call.status === 'ANSWERED' ? '応答' :
                       call.status === 'NO ANSWER' ? '不応答' :
                       call.status === 'BUSY' ? '話中' :
                       call.status === 'FAILED' ? '失敗' : call.status}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {call.duration ? `${call.duration}秒` : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
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