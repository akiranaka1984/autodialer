// frontend/src/components/CampaignDetail.js - タブ機能追加版
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Users, 
  Phone, 
  BarChart3, 
  Settings, 
  RefreshCw,
  Mic,
  AlertCircle,
  Check,
  X
} from 'lucide-react';
import IvrSettings from './IvrSettings';

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State管理
  const [campaign, setCampaign] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isStarting, setIsStarting] = useState(false);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsFilter, setContactsFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';

  // データ取得関数
  const fetchCampaignData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log(`キャンペーンデータ取得開始: ID=${id}`);

      // キャンペーン詳細を取得
      const campaignResponse = await fetch(`${apiBaseUrl}/campaigns/${id}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!campaignResponse.ok) {
        throw new Error(`キャンペーンの取得に失敗しました (${campaignResponse.status})`);
      }

      const campaignData = await campaignResponse.json();
      console.log('キャンペーンデータ:', campaignData);
      setCampaign(campaignData);

      // 統計情報を取得
      const statsResponse = await fetch(`${apiBaseUrl}/campaigns/${id}/stats`, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        console.log('統計データ:', statsData);
        setStats(statsData);
      } else {
        console.warn('統計データの取得に失敗しました');
        setStats({
          progress: 0,
          successRate: 0,
          contacts: { total: 0, pending: 0, completed: 0, failed: 0, dnc: 0 },
          calls: { total: 0, answered: 0, noAnswer: 0, busy: 0, failed: 0, avgDuration: 0 }
        });
      }

      // 連絡先一覧を取得（最初の20件）
      fetchContacts();

    } catch (err) {
      console.error('キャンペーンデータ取得エラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async (page = 1, filter = 'all', search = '') => {
    try {
      console.log(`連絡先取得: page=${page}, filter=${filter}, search=${search}`);
      
      const params = new URLSearchParams({
        limit: '20',
        offset: ((page - 1) * 20).toString()
      });

      if (filter !== 'all') {
        params.append('status', filter);
      }

      if (search.trim()) {
        params.append('search', search.trim());
      }

      const contactsResponse = await fetch(`${apiBaseUrl}/campaigns/${id}/contacts?${params}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json();
        console.log('連絡先データ:', contactsData);
        setContacts(contactsData.contacts || []);
      } else {
        console.warn('連絡先データの取得に失敗しました');
        setContacts([]);
      }
    } catch (err) {
      console.error('連絡先取得エラー:', err);
      setContacts([]);
    }
  };

  // キャンペーン開始/停止
  const handleCampaignAction = async (action) => {
    try {
      setIsStarting(true);
      setError(null);

      const endpoint = action === 'start' ? 'start' : 'stop';
      const response = await fetch(`${apiBaseUrl}/campaigns/${id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `キャンペーンの${action === 'start' ? '開始' : '停止'}に失敗しました`);
      }

      const result = await response.json();
      console.log(`キャンペーン${action}結果:`, result);

      // キャンペーンデータを再取得
      await fetchCampaignData();

    } catch (err) {
      console.error(`キャンペーン${action}エラー:`, err);
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  // 初期データ取得
  useEffect(() => {
    fetchCampaignData();
  }, [id]);

  // 連絡先フィルター変更時
  useEffect(() => {
    if (activeTab === 'contacts') {
      fetchContacts(1, contactsFilter, searchTerm);
      setContactsPage(1);
    }
  }, [contactsFilter, searchTerm, activeTab]);

  // タブ定義
  const tabs = [
    { id: 'overview', name: '概要', icon: BarChart3 },
    { id: 'contacts', name: '連絡先', icon: Users },
    { id: 'ivr', name: 'IVR設定', icon: Mic },
    { id: 'settings', name: '設定', icon: Settings }
  ];

  // ローディング表示
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

  // エラー表示
  if (error) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 mr-2" />
          <div>
            <p className="font-medium">エラーが発生しました</p>
            <p className="text-sm">{error}</p>
            <button
              onClick={fetchCampaignData}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  // キャンペーンが見つからない場合
  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">キャンペーンが見つかりません</p>
        <button
          onClick={() => navigate('/campaigns')}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          キャンペーン一覧に戻る
        </button>
      </div>
    );
  }

  // ステータス色の取得
  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'paused': return 'text-yellow-600 bg-yellow-100';
      case 'completed': return 'text-blue-600 bg-blue-100';
      case 'draft': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return '実行中';
      case 'paused': return '一時停止';
      case 'completed': return '完了';
      case 'draft': return '下書き';
      default: return status;
    }
  };

  // 連絡先ステータス色の取得
  const getContactStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'called': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'dnc': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getContactStatusText = (status) => {
    switch (status) {
      case 'pending': return '未処理';
      case 'called': return '発信済み';
      case 'completed': return '完了';
      case 'failed': return '失敗';
      case 'dnc': return 'DNC';
      default: return status;
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <button
            onClick={() => navigate('/campaigns')}
            className="mr-4 p-2 hover:bg-gray-100 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          <span className={`ml-3 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(campaign.status)}`}>
            {getStatusText(campaign.status)}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex space-x-4">
            {/* 基本情報カード */}
            <div className="bg-white rounded-lg shadow p-4 flex items-center">
              <Users className="h-8 w-8 text-blue-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">連絡先</p>
                <p className="text-xl font-semibold">
                  {stats?.contacts?.total || campaign.contact_count || 0}件
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex items-center">
              <Phone className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">発信者番号</p>
                <p className="text-xl font-semibold">
                  {campaign.caller_id_number || '未設定'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex items-center">
              <BarChart3 className="h-8 w-8 text-purple-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">進捗</p>
                <p className="text-xl font-semibold">
                  {stats?.progress || campaign.progress || 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={fetchCampaignData}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              更新
            </button>

            {campaign.status === 'active' ? (
              <button
                onClick={() => handleCampaignAction('stop')}
                disabled={isStarting}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                <Pause className="h-4 w-4 mr-2" />
                {isStarting ? '停止中...' : '停止'}
              </button>
            ) : (
              <button
                onClick={() => handleCampaignAction('start')}
                disabled={isStarting || !campaign.contact_count}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                <Play className="h-4 w-4 mr-2" />
                {isStarting ? '開始中...' : '開始'}
              </button>
            )}

            <button
              onClick={() => navigate(`/campaigns/${id}/edit`)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              編集
            </button>
          </div>
        </div>
      </div>

      {/* 🔥 タブナビゲーション（この部分が重要） */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center">
                  <tab.icon className="h-5 w-5 mr-2" />
                  {tab.name}
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 🔥 タブコンテンツ（この部分も重要） */}
      <div className="bg-white rounded-lg shadow">
        {/* 概要タブ */}
        {activeTab === 'overview' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">統計情報</h2>
            
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* 完了数 */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {stats.contacts.completed || 0}
                  </div>
                  <div className="text-sm text-gray-600">完了</div>
                </div>

                {/* 処理中 */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {stats.contacts.pending || 0}
                  </div>
                  <div className="text-sm text-gray-600">処理中</div>
                </div>

                {/* 失敗 */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {stats.contacts.failed || 0}
                  </div>
                  <div className="text-sm text-gray-600">失敗</div>
                </div>

                {/* 応答率 */}
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {stats.successRate || 0}%
                  </div>
                  <div className="text-sm text-gray-600">応答率</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 詳細情報 */}
              <div>
                <h3 className="text-lg font-medium mb-3">詳細情報</h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-600">説明</dt>
                    <dd className="text-sm text-gray-900">{campaign.description || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-600">最大同時発信数</dt>
                    <dd className="text-sm text-gray-900">{campaign.max_concurrent_calls || 5}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-600">営業時間</dt>
                    <dd className="text-sm text-gray-900">
                      {campaign.working_hours_start || '09:00'} - {campaign.working_hours_end || '18:00'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm font-medium text-gray-600">作成日時</dt>
                    <dd className="text-sm text-gray-900">
                      {campaign.created_at ? new Date(campaign.created_at).toLocaleString('ja-JP') : '-'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* 通話統計 */}
              {stats && stats.calls && (
                <div>
                  <h3 className="text-lg font-medium mb-3">通話統計</h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-600">総通話数</dt>
                      <dd className="text-sm text-gray-900">{stats.calls.total}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-600">応答数</dt>
                      <dd className="text-sm text-gray-900">{stats.calls.answered}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-600">無応答数</dt>
                      <dd className="text-sm text-gray-900">{stats.calls.noAnswer}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-600">ビジー数</dt>
                      <dd className="text-sm text-gray-900">{stats.calls.busy}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm font-medium text-gray-600">平均通話時間</dt>
                      <dd className="text-sm text-gray-900">{stats.calls.avgDuration}秒</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 連絡先タブ */}
        {activeTab === 'contacts' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">連絡先一覧</h2>
              <button
                onClick={() => navigate(`/campaigns/${id}/contacts`)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                すべて表示
              </button>
            </div>

            {/* フィルターとページング */}
            <div className="mb-4 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="電話番号、名前、会社名で検索"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <select
                  value={contactsFilter}
                  onChange={(e) => setContactsFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">すべて</option>
                  <option value="pending">未処理</option>
                  <option value="called">発信済み</option>
                  <option value="completed">完了</option>
                  <option value="failed">失敗</option>
                  <option value="dnc">DNC</option>
                </select>
              </div>
            </div>

            {/* 連絡先テーブル */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      電話番号
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      名前
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      会社名
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contacts.length > 0 ? (
                    contacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {contact.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {contact.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {contact.company || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getContactStatusColor(contact.status)}`}>
                            {getContactStatusText(contact.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                        連絡先がありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 🔥 IVR設定タブ（この部分が重要） */}
        {activeTab === 'ivr' && (
          <div className="p-6">
            <IvrSettings campaignId={id} />
          </div>
        )}

        {/* 設定タブ */}
        {activeTab === 'settings' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">キャンペーン設定</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  キャンペーン名
                </label>
                <input
                  type="text"
                  value={campaign.name}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={campaign.description || ''}
                  readOnly
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最大同時発信数
                  </label>
                  <input
                    type="number"
                    value={campaign.max_concurrent_calls || 5}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    リトライ回数
                  </label>
                  <input
                    type="number"
                    value={campaign.retry_attempts || 0}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    営業時間開始
                  </label>
                  <input
                    type="time"
                    value={campaign.working_hours_start || '09:00'}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    営業時間終了
                  </label>
                  <input
                    type="time"
                    value={campaign.working_hours_end || '18:00'}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                  />
                </div>
              </div>
              <div className="pt-4">
                <button
                  onClick={() => navigate(`/campaigns/${id}/edit`)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  設定を編集
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignDetail;
