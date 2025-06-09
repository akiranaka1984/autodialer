import React, { useState, useEffect } from 'react';
import { Save, Settings, Phone } from 'lucide-react';

const TransferSettings = ({ campaignId }) => {
  const [settings, setSettings] = useState([
    { dtmf_key: '1', sip_username: '', active: true },
    { dtmf_key: '2', sip_username: '', active: true },
    { dtmf_key: '3', sip_username: '', active: true }
  ]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, [campaignId]);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/transfer-settings`);
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.settings.length > 0 ? data.settings : [
          { dtmf_key: '1', sip_username: '', active: true },
          { dtmf_key: '2', sip_username: '', active: true },
          { dtmf_key: '3', sip_username: '', active: true }
        ]);
      }
    } catch (error) {
      console.error('設定取得エラー:', error);
    }
  };

  const updateSetting = (key, field, value) => {
    setSettings(prev => prev.map(setting => 
      setting.dtmf_key === key 
        ? { ...setting, [field]: value }
        : setting
    ));
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/transfer-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      });
      
      const data = await response.json();
      setMessage(data.success ? '✅ 設定を保存しました' : '❌ ' + data.message);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('❌ 保存エラー: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-6">
        <Settings className="h-5 w-5 mr-2 text-blue-600" />
        <h2 className="text-lg font-semibold">転送設定</h2>
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 ${message.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message}
        </div>
      )}

      <div className="space-y-4">
        {settings.map(setting => (
          <div key={setting.dtmf_key} className="flex items-center space-x-4 p-4 border rounded-lg">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-gray-600" />
              <span className="font-medium">キー {setting.dtmf_key}:</span>
            </div>
            
            <input
              type="text"
              placeholder="SIPアカウント (例: 03760002)"
              value={setting.sip_username}
              onChange={(e) => updateSetting(setting.dtmf_key, 'sip_username', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={setting.active}
                onChange={(e) => updateSetting(setting.dtmf_key, 'active', e.target.checked)}
                className="mr-2"
              />
              有効
            </label>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          キー9: DNC登録（自動設定済み）
        </div>
        
        <button
          onClick={saveSettings}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4 mr-2" />
          {loading ? '保存中...' : '設定保存'}
        </button>
      </div>
    </div>
  );
};

export default TransferSettings;
