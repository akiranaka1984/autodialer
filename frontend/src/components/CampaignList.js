// frontend/src/components/CampaignList.js - 関数重複修正版

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  Trash2, 
  Edit, 
  Plus, 
  Clock, 
  Users, 
  Phone,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

const CampaignList = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [deletingCampaigns, setDeletingCampaigns] = useState(new Set());

  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  
  // キャンペーン一覧を取得
  const fetchCampaigns = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      
      console.log('📋 キャンペーン一覧を取得中...');
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBaseUrl}/campaigns`, {
        method: 'GET',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`データの取得に失敗しました: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ キャンペーン一覧取得成功:', data);
      
      setCampaigns(data);
    } catch (err) {
      console.error('❌ キャンペーン一覧取得エラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 初回読み込み
  useEffect(() => {
    fetchCampaigns();
  }, []);

  // メッセージの自動クリア
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // キャンペーン削除処理（修正版 - 重複削除）
  const deleteCampaign = async (campaignId, campaignName) => {
    console.log('🗑️ 削除処理開始:', { id: campaignId, name: campaignName });
    
    if (!window.confirm(`キャンペーン「${campaignName}」を削除してもよろしいですか？\n\n削除されたデータは復元できません。`)) {
      console.log('削除がキャンセルされました');
      return;
    }

    try {
      setDeletingCampaigns(prev => new Set([...prev, campaignId]));
      setError(null);
      setSuccessMessage(null);
      
      console.log('🚀 DELETE リクエスト送信中...');
      
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });

      console.log('📄 DELETE レスポンス:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'サーバーエラー' }));
        throw new Error(errorData.message || `削除に失敗しました (${response.status})`);
      }

      const result = await response.json().catch(() => ({ message: '削除成功' }));
      console.log('✅ 削除API成功:', result);

      setSuccessMessage(`キャンペーン「${campaignName}」を削除しました`);

      // ローカル状態を即座に更新
      setCampaigns(prevCampaigns => {
        const updatedCampaigns = prevCampaigns.filter(campaign => campaign.id !== campaignId);
        console.log('📊 フィルター後のキャンペーン:', updatedCampaigns);
        return updatedCampaigns;
      });

      // サーバーから最新データを取得
      setTimeout(() => {
        fetchCampaigns(false);
      }, 500);

    } catch (error) {
      console.error('❌ 削除処理エラー:', error);
      setError(`削除に失敗しました: ${error.message}`);
      
      setTimeout(() => {
        fetchCampaigns(false);
      }, 1000);
    } finally {
      setDeletingCampaigns(prev => {
        const newSet = new Set(prev);
        newSet.delete(campaignId);
        return newSet;
      });
    }
  };

  // キャンペーンステータスの更新
  const handleStatusChange = async (campaignId, newStatus) => {
    try {
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'ステータス更新に失敗しました');
      }

      const result = await response.json();
      console.log('ステータス更新成功:', result);
      
      setCampaigns(prevCampaigns =>
        prevCampaigns.map(campaign =>
          campaign.id === campaignId ? { ...campaign, status: newStatus } : campaign
        )
      );
      
      setSuccessMessage(`キャンペーンのステータスを${newStatus}に変更しました`);
    } catch (error) {
      console.error('ステータス更新エラー:', error);
      setError(error.message);
    }
  };

  // ステータスバッジのスタイル
  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800', text: '実行中' },
      paused: { color: 'bg-yellow-100 text-yellow-800', text: '一時停止' },
      draft: { color: 'bg-gray-100 text-gray-800', text: '下書き' },
      completed: { color: 'bg-blue-100 text-blue-800', text: '完了' }
    };
    
    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', text: status };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.text}
      </span>
    );
  };

  // 手動更新ボタン
  const handleRefresh = () => {
    console.log('🔄 手動更新開始');
    fetchCampaigns(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">キャンペーン管理</h1>
        <div className="flex space-x-3">
          <button
            onClick={handleRefresh}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            更新
          </button>
          <Link
            to="/campaigns/new"
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            新規キャンペーン
          </Link>
        </div>
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        </div>
      )}

      {/* 成功メッセージ */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
            <div className="text-sm text-green-700">{successMessage}</div>
          </div>
        </div>
      )}

      {/* キャンペーン一覧 */}
      {campaigns.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">キャンペーンがありません</p>
          <Link
            to="/campaigns/new"
            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            最初のキャンペーンを作成
          </Link>
        </div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  キャンペーン名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  発信者番号
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  進捗
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  作成日時
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {campaign.name}
                        </div>
                        {campaign.description && (
                          <div className="text-sm text-gray-500">
                            {campaign.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(campaign.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {campaign.caller_id_number || '未設定'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span>0 / 0 件 (0%)</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString('ja-JP') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      {/* ステータス変更ボタン */}
                      {campaign.status === 'draft' && (
                        <button
                          onClick={() => handleStatusChange(campaign.id, 'active')}
                          className="inline-flex items-center p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md transition-colors"
                          title="開始"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      
                      {campaign.status === 'active' && (
                        <button
                          onClick={() => handleStatusChange(campaign.id, 'paused')}
                          className="inline-flex items-center p-2 text-yellow-600 hover:text-yellow-900 hover:bg-yellow-50 rounded-md transition-colors"
                          title="一時停止"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                      
                      {campaign.status === 'paused' && (
                        <button
                          onClick={() => handleStatusChange(campaign.id, 'active')}
                          className="inline-flex items-center p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md transition-colors"
                          title="再開"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}

                      {/* 編集ボタン */}
                      <Link
                        to={`/campaigns/${campaign.id}`}
                        className="inline-flex items-center p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md transition-colors"
                        title="編集"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>

                      {/* 削除ボタン - 関数名を変更 */}
                      <button
                        onClick={() => deleteCampaign(campaign.id, campaign.name)}
                        disabled={deletingCampaigns.has(campaign.id)}
                        className={`inline-flex items-center p-2 rounded-md transition-colors ${
                          deletingCampaigns.has(campaign.id)
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-red-600 hover:text-red-900 hover:bg-red-50'
                        }`}
                        title={deletingCampaigns.has(campaign.id) ? '削除中...' : '削除'}
                      >
                        {deletingCampaigns.has(campaign.id) ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CampaignList;