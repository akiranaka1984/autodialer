import React, { useState, useEffect } from 'react';
import { Settings, Download, Users, TrendingUp, Clock, Save } from 'lucide-react';

const LeadManagement = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [thresholdSeconds, setThresholdSeconds] = useState(15);
  const [hotLeads, setHotLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      loadCampaignData();
    }
  }, [selectedCampaign]);

  const loadCampaigns = async () => {
    try {
      const response = await fetch(`${API_BASE}/campaigns`);
      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (error) {
      console.error('Error:', error);
      setMessage('キャンペーンの読み込みに失敗しました');
    }
  };

  const loadCampaignData = async () => {
    setLoading(true);
    try {
      // 設定を読み込む
      const settingsRes = await fetch(`${API_BASE}/leads/campaigns/${selectedCampaign}/settings`);
      const settingsData = await settingsRes.json();
      setThresholdSeconds(settingsData.settings.threshold_seconds);

      // 見込み客リストを読み込む
      const leadsRes = await fetch(`${API_BASE}/leads/campaigns/${selectedCampaign}/hot-leads`);
      const leadsData = await leadsRes.json();
      setHotLeads(leadsData.leads || []);
      setStats(leadsData.stats || null);
    } catch (error) {
      console.error('Error:', error);
      setMessage('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/leads/campaigns/${selectedCampaign}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold_seconds: thresholdSeconds })
      });
      
      if (response.ok) {
        setMessage(`設定を${thresholdSeconds}秒に変更しました`);
        await loadCampaignData();
      }
    } catch (error) {
      console.error('Error:', error);
      setMessage('設定の保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    window.location.href = `${API_BASE}/leads/campaigns/${selectedCampaign}/export?threshold=${thresholdSeconds}`;
  };

  const formatDuration = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-red-600';
    if (score >= 60) return 'text-orange-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-gray-600';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Users className="w-6 h-6" />
          見込み客管理システム
        </h1>
        
        <div className="flex gap-4 items-center">
          <label className="font-medium">キャンペーン選択:</label>
          <select 
            className="flex-1 max-w-xs px-3 py-2 border rounded-lg"
            value={selectedCampaign || ''}
            onChange={(e) => setSelectedCampaign(e.target.value)}
          >
            <option value="">-- 選択してください --</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} (ID: {c.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCampaign && (
        <>
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              判定時間の設定
            </h2>
            
            <div className="flex items-center gap-4">
              <span>通話時間が</span>
              <input 
                type="range"
                min="5"
                max="30"
                step="5"
                value={thresholdSeconds}
                onChange={(e) => setThresholdSeconds(parseInt(e.target.value))}
                className="w-48"
              />
              <span className="font-bold text-xl text-blue-600 w-20">
                {thresholdSeconds}秒
              </span>
              <span>以上を見込み客とする</span>
              <button
                onClick={saveSettings}
                disabled={loading}
                className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                <Save className="w-4 h-4 inline mr-1" />
                保存
              </button>
            </div>
            
            <div className="mt-4 flex gap-2">
              <span className="text-sm text-gray-600">クイック設定:</span>
              {[5, 10, 15, 20, 30].map(sec => (
                <button
                  key={sec}
                  onClick={() => setThresholdSeconds(sec)}
                  className={`px-3 py-1 rounded text-sm ${
                    thresholdSeconds === sec 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {sec}秒
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
              <h2 className="font-semibold">
                見込み客リスト（{thresholdSeconds}秒以上）- {hotLeads.length}件
              </h2>
              <button
                onClick={exportCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download className="w-4 h-4 inline mr-1" />
                CSVエクスポート
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">電話番号</th>
                    <th className="px-4 py-2 text-left">氏名</th>
                    <th className="px-4 py-2 text-center">最長聴取</th>
                    <th className="px-4 py-2 text-center">通話回数</th>
                    <th className="px-4 py-2 text-left">最終通話</th>
                  </tr>
                </thead>
                <tbody>
                  {hotLeads.map((lead, index) => (
                    <tr key={index} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono">{lead.phone_number}</td>
                      <td className="px-4 py-2">{lead.contact_name || '-'}</td>
                      <td className="px-4 py-2 text-center">
                        <span className="font-bold">{formatDuration(lead.max_duration)}</span>
                      </td>
                      <td className="px-4 py-2 text-center">{lead.call_count}</td>
                      <td className="px-4 py-2 text-sm">
                        {lead.last_call_date ? new Date(lead.last_call_date).toLocaleString('ja-JP') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {hotLeads.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                {thresholdSeconds}秒以上聞いた見込み客はまだいません
              </div>
            )}
          </div>

          {message && (
            <div className="mt-4 p-4 bg-blue-100 text-blue-800 rounded-lg">
              {message}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LeadManagement;
