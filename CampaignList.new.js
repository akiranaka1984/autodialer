// frontend/src/components/CampaignList.js - 修正版
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  Plus, 
  Edit, 
  Trash2, 
  Users, 
  Phone, 
  BarChart3,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Clock
} from 'lucide-react';

const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || '/api';
};

const CampaignList = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns`;
      
      console.log('キャンペーン一覧取得:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      console.log('キャンペーンAPIレスポンス状態:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('キャンペーン取得エラー:', response.status, errorText);
        throw new Error(`キャンペーンの取得に失敗しました (${response.status})`);
      }

      const data = await response.json();
      console.log('キャンペーンデータ受信:', data);

      // ✅ 修正: データ構造を正しく処理
      let campaignsList = [];
      
      if (Array.isArray(data)) {
        // データが直接配列の場合
        campaignsList = data;
      } else if (data && Array.isArray(data.campaigns)) {
        // データがオブジェクトで campaigns プロパティに配列がある場合
        campaignsList = data.campaigns;
      } else if (data && typeof data === 'object') {
        // データがオブジェクトの場合、プロパティをチェック
        campaignsList = data.data || data.results || data.items || [];
      } else {
        // 予期しない形式の場合は空配列
        campaignsList = [];
      }

      console.log('処理後のキャンペーン一覧:', campaignsList);
      
      // ✅ 配列であることを確認
      if (!Array.isArray(campaignsList)) {
        console.warn('キャンペーンデータが配列ではありません:', campaignsList);
        campaignsList = [];
      }

      setCampaigns(campaignsList);
      
    } catch (err) {
      console.error('キャンペーン取得エラー:', err);
      setError(err.message || 'キャンペーンの取得中にエラーが発生しました');
      
      // エラー時は空配列をセット
      setCampaigns([]);
      
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (campaignId, newStatus) => {
    try {
      setActionLoading(campaignId);
      
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns/${campaignId}/${newStatus === 'active' ? 'start' : 'stop'}`;
      
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
      
      // キャンペーン一覧を再取得
      await fetchCampaigns();
      
    } catch (err) {
      console.error('キャンペーン状態変更エラー:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCampaign = async (campaignId) => {
    if (!window.confirm('このキャンペーンを削除してもよろしいですか？関連する連絡先も削除されます。')) {
      return;
    }

    try {
      setActionLoading(campaignId);
      
      const token = localStorage.getItem('token');
      const apiUrl = `${getApiBaseUrl()}/campaigns/${campaignId}`;
      
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'キャンペーンの削除に失敗しました');
      }

      // キャンペーン一覧を再取得
      await fetchCampaigns();
      
    } catch (err) {
      console.error('キャンペーン削除エラー:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">キャンペーン管理</h1>
        <div className="flex space-x-3">
          <button
            onClick={fetchCampaigns}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </button>
          <Link
            to="/campaigns/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            新規キャンペーン
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>
              <p className="font-medium">エラーが発生しました</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 修正: campaigns が配列であることを確認してから map を使用 */}
      {campaigns.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-6 text-center">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <BarChart3 className="h-12 w-12" />
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">キャンペーンがありません</h3>
          <p className="mt-1 text-sm text-gray-500">新しいキャンペーンを作成して開始しましょう。</p>
          <div className="mt-6">
            <Link
              to="/campaigns/new"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              新規キャンペーン作成
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center">
                        <Link
                          to={`/campaigns/${campaign.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate"
                        >
                          {campaign.name}
                        </Link>
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                          {getStatusText(campaign.status)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center text-sm text-gray-500">
                        <Users className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        <span className="truncate">
                          {campaign.contact_count || 0} 件の連絡先
                        </span>
                        <span className="mx-2">•</span>
                        <Phone className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        <span className="truncate">
                          {campaign.caller_id_number || '発信者番号未設定'}
                        </span>
                      </div>
                      {campaign.description && (
                        <div className="mt-1 text-sm text-gray-500 truncate">
                          {campaign.description}
                        </div>
                      )}
                      <div className="mt-1 flex items-center text-xs text-gray-400">
                        <Clock className="flex-shrink-0 mr-1 h-3 w-3" />
                        作成: {formatDate(campaign.created_at)}
                        {campaign.updated_at && campaign.updated_at !== campaign.created_at && (
                          <>
                            <span className="mx-2">•</span>
                            更新: {formatDate(campaign.updated_at)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* 進捗表示 */}
                    {campaign.progress !== undefined && (
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${campaign.progress}%` }}
                          ></div>
                        </div>
                        <span className="ml-2 text-xs text-gray-600">{campaign.progress}%</span>
                      </div>
                    )}
                    
                    {/* アクション ボタン */}
                    <div className="flex items-center space-x-1">
                      {campaign.status === 'active' ? (
                        <button
                          onClick={() => handleStatusChange(campaign.id, 'paused')}
                          disabled={actionLoading === campaign.id}
                          className="p-2 text-orange-600 hover:text-orange-800 hover:bg-orange-100 rounded-full"
                          title="一時停止"
                        >
                          {actionLoading === campaign.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-orange-600 border-t-transparent rounded-full"></div>
                          ) : (
                            <Pause className="h-4 w-4" />
                          )}
                        </button>
                      ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
                        <button
                          onClick={() => handleStatusChange(campaign.id, 'active')}
                          disabled={actionLoading === campaign.id}
                          className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-full"
                          title="開始"
                        >
                          {actionLoading === campaign.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full"></div>
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                      
                      <Link
                        to={`/campaigns/${campaign.id}/edit`}
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full"
                        title="編集"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      
                      {campaign.status !== 'active' && (
                        <button
                          onClick={() => deleteCampaign(campaign.id)}
                          disabled={actionLoading === campaign.id}
                          className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-full"
                          title="削除"
                        >
                          {actionLoading === campaign.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full"></div>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      
                      <Link
                        to={`/campaigns/${campaign.id}`}
                        className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full"
                        title="詳細"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CampaignList;
