import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  Phone, Users, BarChart2, PlayCircle, PauseCircle, 
  Download, RefreshCw, ChevronLeft, Upload, FileText, AlertCircle
} from 'lucide-react';
import { 
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchCampaignDetails();
  }, [id]);

  const fetchCampaignDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // 開発環境用モックデータ
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => {
          setCampaign({
            id: parseInt(id),
            name: 'サンプルキャンペーン',
            description: 'テスト用のキャンペーン',
            status: 'active',
            caller_id_number: '0312345678',
            caller_id_description: '東京オフィス',
            created_at: '2025-05-01T09:00:00Z',
            stats: {
              totalContacts: 150,
              completedContacts: 87,
              totalCalls: 95,
              answeredCalls: 72,
              answerRate: 76
            },
            progress: 58,
            callStats: {
              byStatus: [
                { name: '応答', value: 72 },
                { name: '不応答', value: 15 },
                { name: '話中', value: 5 },
                { name: '失敗', value: 3 }
              ],
              byHour: [
                { hour: '9:00', calls: 10, answered: 8 },
                { hour: '10:00', calls: 15, answered: 12 },
                { hour: '11:00', calls: 18, answered: 15 },
                { hour: '12:00', calls: 8, answered: 5 },
                { hour: '13:00', calls: 12, answered: 9 },
                { hour: '14:00', calls: 16, answered: 13 },
                { hour: '15:00', calls: 16, answered: 10 }
              ]
            }
          });
          setLoading(false);
        }, 500);
        return;
      }
      
      const response = await fetch(`/api/campaigns/${id}/details`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('キャンペーン詳細の取得に失敗しました');
      
      const data = await response.json();
      setCampaign(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (action) => {
    try {
      setActionInProgress(true);
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setCampaign(prev => ({
          ...prev,
          status: action === 'pause' ? 'paused' : 'active'
        }));
        return;
      }
      
      const response = await fetch(`/api/campaigns/${id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error(`キャンペーンの${action}に失敗しました`);
      
      await fetchCampaignDetails();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        // モックCSVデータ
        const csvContent = `発信日時,電話番号,名前,会社名,ステータス,通話時間（秒）,キー入力
2025-05-05 10:30:15,09012345678,山田太郎,株式会社A,ANSWERED,45,1
2025-05-05 10:32:10,09023456789,佐藤花子,有限会社B,NO ANSWER,0,
2025-05-05 10:35:00,09034567890,鈴木一郎,株式会社C,ANSWERED,68,`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campaign_${id}_report.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      
      const response = await fetch(`/api/reports/campaigns/${id}/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('データのエクスポートに失敗しました');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_${id}_report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.message);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) return <div className="p-4">キャンペーンが見つかりません</div>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link to="/campaigns" className="mr-4">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
        </div>
        <div className="flex space-x-2">
          {campaign.status === 'active' && (
            <button
              onClick={() => handleStatusChange('pause')}
              disabled={actionInProgress}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              <PauseCircle className="h-5 w-5 mr-1 inline" />
              一時停止
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => handleStatusChange('resume')}
              disabled={actionInProgress}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              <PlayCircle className="h-5 w-5 mr-1 inline" />
              再開
            </button>
          )}
          {campaign.status === 'draft' && (
            <button
              onClick={() => handleStatusChange('start')}
              disabled={actionInProgress}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <PlayCircle className="h-5 w-5 mr-1 inline" />
              開始
            </button>
          )}
          <Link
            to={`/campaigns/${id}/contacts/upload`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Upload className="h-5 w-5 mr-1 inline" />
            連絡先追加
          </Link>
          <button onClick={handleExport} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
            <Download className="h-5 w-5 mr-1 inline" />
            エクスポート
          </button>
          <button onClick={fetchCampaignDetails} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
            <RefreshCw className="h-5 w-5 mr-1 inline" />
            更新
          </button>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            概要
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'contacts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            連絡先
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            レポート
          </button>
        </nav>
      </div>

      {/* 概要タブ */}
      {activeTab === 'overview' && (
        <>
          {/* 統計カード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">連絡先数</p>
                  <p className="text-xl font-semibold">{campaign.stats.totalContacts}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <Phone className="h-8 w-8 text-green-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">発信数</p>
                  <p className="text-xl font-semibold">{campaign.stats.totalCalls}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <BarChart2 className="h-8 w-8 text-purple-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">応答率</p>
                  <p className="text-xl font-semibold">{campaign.stats.answerRate}%</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center mr-3">
                  <span className="text-orange-600 font-bold">{campaign.progress}%</span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">進捗</p>
                  <p className="text-xl font-semibold">
                    {campaign.stats.completedContacts}/{campaign.stats.totalContacts}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* キャンペーン詳細情報 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">キャンペーン詳細</h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">説明</dt>
                <dd className="mt-1 text-sm text-gray-900">{campaign.description || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">発信者番号</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {campaign.caller_id_number} ({campaign.caller_id_description})
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">ステータス</dt>
                <dd className="mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold
                    ${campaign.status === 'active' ? 'bg-green-100 text-green-800' : 
                      campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800' : 
                      campaign.status === 'completed' ? 'bg-gray-100 text-gray-800' : 
                      'bg-blue-100 text-blue-800'}`}>
                    {campaign.status === 'active' ? '実行中' : 
                     campaign.status === 'paused' ? '一時停止' : 
                     campaign.status === 'draft' ? '下書き' : '完了'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">作成日時</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(campaign.created_at).toLocaleString('ja-JP')}
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      {/* 連絡先タブ */}
      {activeTab === 'contacts' && (
        <ContactsList campaignId={id} />
      )}

      {/* レポートタブ */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 通話ステータス分布 */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">通話ステータス</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={campaign.callStats.byStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {campaign.callStats.byStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 時間帯別通話数 */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">時間帯別通話数</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campaign.callStats.byHour}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="calls" name="総通話数" fill="#8884d8" />
                <Bar dataKey="answered" name="応答数" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

// 連絡先リストコンポーネント
const ContactsList = ({ campaignId }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  });

  useEffect(() => {
    fetchContacts();
  }, [campaignId, pagination.page]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => {
          setContacts([
            { id: 1, phone: '09012345678', name: '山田太郎', company: '株式会社A', status: 'completed', last_attempt: '2025-05-05T10:30:15Z' },
            { id: 2, phone: '09023456789', name: '佐藤花子', company: '有限会社B', status: 'pending', last_attempt: null },
            { id: 3, phone: '09034567890', name: '鈴木一郎', company: '株式会社C', status: 'failed', last_attempt: '2025-05-05T10:35:00Z' },
          ]);
          setPagination(prev => ({ ...prev, total: 150 }));
          setLoading(false);
        }, 500);
        return;
      }
      
      const offset = (pagination.page - 1) * pagination.limit;
      const response = await fetch(
        `/api/contacts/campaign/${campaignId}?limit=${pagination.limit}&offset=${offset}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) throw new Error('連絡先の取得に失敗しました');
      
      const data = await response.json();
      setContacts(data.contacts);
      setPagination(prev => ({ ...prev, total: data.pagination.total }));
    } catch (error) {
      console.error('連絡先取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      dnc: 'bg-purple-100 text-purple-800'
    };
    
    const labels = {
      pending: '未処理',
      completed: '完了',
      failed: '失敗',
      dnc: '着信拒否'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">電話番号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名前</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">会社名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最終発信</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {contacts.map(contact => (
              <tr key={contact.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{contact.phone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{contact.name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{contact.company || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(contact.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {contact.last_attempt ? new Date(contact.last_attempt).toLocaleString('ja-JP') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* ページネーション */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            前へ
          </button>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page * pagination.limit >= pagination.total}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            次へ
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              全{' '}
              <span className="font-medium">{pagination.total}</span>
              {' '}件中{' '}
              <span className="font-medium">
                {(pagination.page - 1) * pagination.limit + 1}
              </span>
              {' '}-{' '}
              <span className="font-medium">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>
              {' '}件を表示
            </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                前へ
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page * pagination.limit >= pagination.total}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                次へ
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetail;