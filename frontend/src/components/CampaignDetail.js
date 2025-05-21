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
import IVRSettings from './IvrSettings';
import AudioFileUploader from './AudioFileUploader';

// APIベースURLの取得 - 環境変数がない場合は相対パスを使用
const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || '/api';
};

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
      setError(null);
      const token = localStorage.getItem('token');
      
      // デバッグ用にAPIリクエスト情報をログ出力
      const apiUrl = `${getApiBaseUrl()}/campaigns/${id}/details`;
      console.log('APIリクエスト:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.status === 404) {
        throw new Error('キャンペーンが見つかりません');
      } else if (response.status === 500) {
        throw new Error('サーバー内部エラーが発生しました。管理者に連絡してください。');
      } else if (!response.ok) {
        const errorData = await response.text();
        console.error('API応答エラー:', errorData);
        throw new Error(`キャンペーン詳細の取得に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('取得したキャンペーンデータ:', data);
      setCampaign(data);
    } catch (err) {
      console.error('キャンペーン詳細取得エラー:', err);
      setError(err.message || 'データ取得中にエラーが発生しました');
      
      // フォールバックとしてモックデータを設定
      setCampaign({
        id: parseInt(id),
        name: 'キャンペーン情報取得エラー',
        description: '接続エラーのため、データを表示できません',
        status: 'draft',
        caller_id_number: 'エラー',
        caller_id_description: 'データなし',
        created_at: new Date().toISOString(),
        stats: {
          totalContacts: 0,
          completedContacts: 0,
          totalCalls: 0,
          answeredCalls: 0,
          answerRate: 0
        },
        progress: 0,
        callStats: {
          byStatus: [
            { name: 'データなし', value: 1 }
          ],
          byHour: []
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (action) => {
    try {
      setActionInProgress(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/campaigns/${id}/${action}`;
      console.log('APIリクエスト:', apiUrl, 'メソッド:', 'POST');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({}) // 空のオブジェクトを送信
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('API応答エラー:', errorData);
        throw new Error(`キャンペーンの${action}に失敗しました (${response.status})`);
      }
      
      // 成功したら更新
      await fetchCampaignDetails();
    } catch (err) {
      console.error(`キャンペーン${action}エラー:`, err);
      setError(err.message || 'ステータス変更中にエラーが発生しました');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleExport = async () => {
    try {
      setError(null);
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/reports/campaigns/${id}/export`;
      console.log('APIリクエスト:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('エクスポートエラー:', errorData);
        throw new Error(`データのエクスポートに失敗しました (${response.status})`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign_${id}_report.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('エクスポートエラー:', err);
      setError(err.message || 'エクスポート中にエラーが発生しました');
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

  if (error && !campaign) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
        <div className="mt-4">
          <button 
            onClick={fetchCampaignDetails}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <RefreshCw className="h-5 w-5 mr-1 inline" />
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (!campaign) return <div className="p-4">キャンペーンが見つかりません</div>;

  return (
    <div className="p-4">
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
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
          {/* IVR設定タブ */}
          <button
            onClick={() => setActiveTab('ivr')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'ivr'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            IVR設定
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
                  <p className="text-xl font-semibold">
                    {campaign.stats?.totalContacts || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <Phone className="h-8 w-8 text-green-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">発信数</p>
                  <p className="text-xl font-semibold">
                    {campaign.stats?.totalCalls || 0}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <BarChart2 className="h-8 w-8 text-purple-500 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">応答率</p>
                  <p className="text-xl font-semibold">
                    {campaign.stats?.answerRate || 0}%
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center mr-3">
                  <span className="text-orange-600 font-bold">{campaign.progress || 0}%</span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">進捗</p>
                  <p className="text-xl font-semibold">
                    {campaign.stats?.completedContacts || 0}/{campaign.stats?.totalContacts || 0}
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
                  {campaign.caller_id_number || '-'} 
                  {campaign.caller_id_description ? `(${campaign.caller_id_description})` : ''}
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
                  {campaign.created_at ? new Date(campaign.created_at).toLocaleString('ja-JP') : '-'}
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
            {campaign.callStats && campaign.callStats.byStatus && campaign.callStats.byStatus.length > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                表示するデータがありません
              </div>
            )}
          </div>

          {/* 時間帯別通話数 */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">時間帯別通話数</h2>
            {campaign.callStats && campaign.callStats.byHour && campaign.callStats.byHour.length > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                表示するデータがありません
              </div>
            )}
          </div>
        </div>
      )}

      {/* IVR設定タブ */}
      {activeTab === 'ivr' && (
        <div>
          <IVRSettings campaignId={id} />
        </div>
      )}
    </div>
  );
};

// 連絡先リストコンポーネント
const ContactsList = ({ campaignId }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      setError(null);
      const token = localStorage.getItem('token');
      
      const offset = (pagination.page - 1) * pagination.limit;
      const apiUrl = `${getApiBaseUrl()}/contacts/campaign/${campaignId}?limit=${pagination.limit}&offset=${offset}`;
      console.log('連絡先取得APIリクエスト:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        // エラーのレスポンスボディをログ出力
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('連絡先取得API応答エラー:', errorText);
          
          // JSONとしてパース可能か試みる
          const errorData = JSON.parse(errorText);
          if (errorData.message) {
            throw new Error(errorData.message);
          }
        } catch (parseError) {
          // JSONパースエラーの場合、または明示的なエラーメッセージがない場合
          console.error('エラーレスポンスのパースエラー:', parseError);
        }
        
        throw new Error(`連絡先の取得に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('取得した連絡先データ:', data);
      
      // バックエンドからのレスポンス形式に合わせて処理
      if (data && Array.isArray(data.contacts)) {
        // 正しいレスポンス形式: { contacts: [], total: number, page: number, totalPages: number }
        setContacts(data.contacts);
        setPagination(prev => ({ 
          ...prev, 
          total: data.total || 0,
          page: data.page || prev.page,
          totalPages: data.totalPages || 1
        }));
      } else if (Array.isArray(data)) {
        // APIが配列を直接返す場合の対応
        setContacts(data);
        setPagination(prev => ({ ...prev, total: data.length }));
      } else {
        console.warn('予期しないAPIレスポンス形式:', data);
        // データが全くない状態として扱う（空の配列を設定）
        setContacts([]);
        setPagination(prev => ({ ...prev, total: 0 }));
      }
    } catch (err) {
      console.error('連絡先取得エラー:', err);
      setError(err.message || '連絡先データの取得中にエラーが発生しました');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      dnc: 'bg-purple-100 text-purple-800',
      called: 'bg-blue-100 text-blue-800'
    };
    
    const labels = {
      pending: '未処理',
      completed: '完了',
      failed: '失敗',
      dnc: '着信拒否',
      called: '発信中'
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

  if (error) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
          <div>
            <p>{error}</p>
            <button 
              onClick={fetchContacts}
              className="mt-2 px-3 py-1 bg-red-700 text-white rounded hover:bg-red-800 text-sm"
            >
              再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-500 mb-4">このキャンペーンには連絡先がありません</p>
        <Link
          to={`/campaigns/${campaignId}/contacts/upload`}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center"
        >
          <Upload className="h-5 w-5 mr-1" />
          連絡先を追加
        </Link>
      </div>
    );
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
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            前へ
          </button>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page * pagination.limit >= pagination.total}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
                {pagination.total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}
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
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                前へ
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page * pagination.limit >= pagination.total}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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