import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Phone, Users, BarChart2, PlayCircle, PauseCircle, 
  Download, RefreshCw, ChevronLeft 
} from 'lucide-react';

const CampaignDetail = () => {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    fetchCampaignDetails();
  }, [id]);

  const fetchCampaignDetails = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
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

  if (loading) return <div className="p-4">読み込み中...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
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
              className="btn btn-secondary"
            >
              <PauseCircle className="h-5 w-5 mr-1" />
              一時停止
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => handleStatusChange('resume')}
              disabled={actionInProgress}
              className="btn btn-primary"
            >
              <PlayCircle className="h-5 w-5 mr-1" />
              再開
            </button>
          )}
          {campaign.status === 'draft' && (
            <button
              onClick={() => handleStatusChange('start')}
              disabled={actionInProgress}
              className="btn btn-primary"
            >
              <PlayCircle className="h-5 w-5 mr-1" />
              開始
            </button>
          )}
          <button onClick={handleExport} className="btn btn-outline">
            <Download className="h-5 w-5 mr-1" />
            エクスポート
          </button>
          <button onClick={fetchCampaignDetails} className="btn btn-outline">
            <RefreshCw className="h-5 w-5 mr-1" />
            更新
          </button>
        </div>
      </div>

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
                {campaign.status}
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
    </div>
  );
};

export default CampaignDetail;