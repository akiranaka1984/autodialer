// frontend/src/components/CampaignDetail.js - 修正版
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Edit, 
  Users, 
  Phone, 
  Calendar,
  Clock,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Plus
} from 'lucide-react';

const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || '/api';
};

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [campaign, setCampaign] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCampaignDetail();
      fetchCampaignContacts();
      fetchCampaignStats();
    }
  }, [id]);

  const fetchCampaignDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns/${id}`;
      
      console.log('キャンペーン詳細取得:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      console.log('キャンペーン詳細レスポンス状態:', response.status);

      if (response.status === 404) {
        setError('キャンペーンが見つかりません');
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('キャンペーン詳細取得エラー:', response.status, errorText);
        throw new Error(`キャンペーンの取得に失敗しました (${response.status})`);
      }

      const data = await response.json();
      console.log('キャンペーン詳細データ:', data);

      setCampaign(data);
      
    } catch (err) {
      console.error('キャンペーン詳細取得エラー:', err);
      setError(err.message || 'キャンペーンの取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchCampaignContacts = async () => {
    try {
      setContactsLoading(true);
      
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns/${id}/contacts?limit=10`;
      
      console.log('キャンペーン連絡先取得:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      console.log('キャンペーン連絡先レスポンス状態:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('キャンペーン連絡先データ:', data);
        
        // データ構造を確認して適切に設定
        if (Array.isArray(data)) {
          setContacts(data);
        } else if (data && Array.isArray(data.contacts)) {
          setContacts(data.contacts);
        } else {
          setContacts([]);
        }
      } else {
        console.warn('連絡先取得失敗:', response.status);
        setContacts([]);
      }
      
    } catch (err) {
      console.error('キャンペーン連絡先取得エラー:', err);
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchCampaignStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns/${id}/stats`;
      
      console.log('キャンペーン統計取得:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('キャンペーン統計データ:', data);
        setStats(data);
      } else {
        console.warn('統計取得失敗:', response.status);
      }
      
    } catch (err) {
      console.error('キャンペーン統計取得エラー:', err);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      setActionLoading(true);
      
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns/${id}/${newStatus === 'active' ? 'start' : 'stop'}`;
      
      console.log(`キャンペーン${newStatus === 'active' ? '開始' : '停止'}:`, apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `キャンペーンの${newStatus === 'active' ? '開始' : '停止'}に失敗しました`);
      }

      const result = await response.json();
      console.log('キャンペーン状態変更結果:', result);
      
      // 詳細情報を再取得
      await fetchCampaignDetail();
      
    } catch (err) {
      console.error('キャンペーン状態変更エラー:', err);
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return 'アクティブ';
      case 'paused':
        return '一時停止';
      case 'completed':
        return '完了';
      case 'draft':
        return '下書き';
      default:
        return '不明';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
      <div className="p-6">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>
              <p className="font-medium">エラーが発生しました</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => navigate('/campaigns')}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            キャンペーン一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <div className="text-center">
          <p className="text-gray-500">キャンペーンデータを取得中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/campaigns')}
            className="mr-4 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <div className="flex items-center mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                {getStatusText(campaign.status)}
              </span>
              {campaign.progress !== undefined && (
                <div className="ml-4 flex items-center">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${campaign.progress}%` }}
                    ></div>
                  </div>
                  <span className="ml-2 text-sm text-gray-600">{campaign.progress}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={fetchCampaignDetail}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </button>
          
          {campaign.status === 'active' ? (
            <button
              onClick={() => handleStatusChange('paused')}
              disabled={actionLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              {actionLoading ? (
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              一時停止
            </button>
          ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
            <button
              onClick={() => handleStatusChange('active')}
              disabled={actionLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading ? (
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              開始
            </button>
          ) : null}
          
          <button
            onClick={() => navigate(`/campaigns/${id}/edit`)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Edit className="h-4 w-4 mr-2" />
            編集
          </button>
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

      {/* 基本情報 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">連絡先</dt>
                  <dd className="text-lg font-medium text-gray-900">{campaign.contact_count || 0} 件</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Phone className="h-8 w-8 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">発信者番号</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {campaign.caller_id_number || '未設定'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BarChart3 className="h-8 w-8 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">進捗</dt>
                  <dd className="text-lg font-medium text-gray-900">{campaign.progress || 0}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 統計情報 */}
      {stats && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">統計情報</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.contacts?.completed || 0}</div>
              <div className="text-sm text-gray-500">完了</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.contacts?.pending || 0}</div>
              <div className="text-sm text-gray-500">未処理</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.contacts?.failed || 0}</div>
              <div className="text-sm text-gray-500">失敗</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.calls?.answered || 0}</div>
              <div className="text-sm text-gray-500">応答</div>
            </div>
          </div>
        </div>
      )}

      {/* 連絡先一覧 */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">連絡先一覧</h3>
            <button
              onClick={() => navigate(`/campaigns/${id}/contacts`)}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200"
            >
              すべて表示
            </button>
          </div>
          
          {contactsLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          ) : contacts.length > 0 ? (
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
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
                  {contacts.slice(0, 5).map((contact, index) => (
                    <tr key={contact.id || index}>
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
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          contact.status === 'completed' ? 'bg-green-100 text-green-800' :
                          contact.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          contact.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {contact.status === 'completed' ? '完了' :
                           contact.status === 'pending' ? '未処理' :
                           contact.status === 'failed' ? '失敗' :
                           contact.status || '不明'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">連絡先がありません</h3>
              <p className="mt-1 text-sm text-gray-500">まず連絡先を追加してください。</p>
              <div className="mt-6">
                <button
                  onClick={() => navigate(`/campaigns/${id}/contacts/import`)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  連絡先を追加
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* キャンペーン詳細情報 */}
      <div className="mt-6 bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">詳細情報</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">説明</dt>
            <dd className="mt-1 text-sm text-gray-900">{campaign.description || '-'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">最大同時発信数</dt>
            <dd className="mt-1 text-sm text-gray-900">{campaign.max_concurrent_calls || 5}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">営業時間</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {campaign.working_hours_start || '09:00'} - {campaign.working_hours_end || '18:00'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">作成日時</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(campaign.created_at)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">更新日時</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(campaign.updated_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
};

export default CampaignDetail;
