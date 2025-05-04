import React, { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle, Check } from 'lucide-react';

const SystemSettings = () => {
  const [settings, setSettings] = useState({
    defaultCallerID: '',
    defaultRetryAttempts: 3,
    defaultMaxConcurrentCalls: 10,
    defaultWorkingHoursStart: '09:00',
    defaultWorkingHoursEnd: '18:00',
    callTimeout: 30,
    recordCalls: false,
    enableSMS: false,
    smsProvider: '',
    smsApiKey: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [callerIds, setCallerIds] = useState([]);

  useEffect(() => {
    fetchSettings();
    fetchCallerIds();
  }, []);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('設定の取得に失敗しました');
      
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCallerIds = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/caller-ids', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('発信者番号の取得に失敗しました');
      
      const data = await response.json();
      setCallerIds(data);
    } catch (error) {
      console.error('発信者番号取得エラー:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      
      if (!response.ok) throw new Error('設定の保存に失敗しました');
      
      setSuccessMessage('設定を保存しました');
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4">読み込み中...</div>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">システム設定</h1>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <div className="flex">
            <Check className="h-5 w-5 mr-2" />
            <p>{successMessage}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本設定 */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">基本設定</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                デフォルト発信者番号
              </label>
              <select
                name="defaultCallerID"
                value={settings.defaultCallerID}
                onChange={handleChange}
                className="w-full border rounded-md shadow-sm p-2"
              >
                <option value="">選択してください</option>
                {callerIds.filter(c => c.active).map(callerId => (
                  <option key={callerId.id} value={callerId.id}>
                    {callerId.number} - {callerId.description}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                デフォルトリトライ回数
              </label>
              <input
                type="number"
                name="defaultRetryAttempts"
                value={settings.defaultRetryAttempts}
                onChange={handleChange}
                min="0"
                max="10"
                className="w-full border rounded-md shadow-sm p-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                デフォルト最大同時発信数
              </label>
              <input
                type="number"
                name="defaultMaxConcurrentCalls"
                value={settings.defaultMaxConcurrentCalls}
                onChange={handleChange}
                min="1"
                max="100"
                className="w-full border rounded-md shadow-sm p-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                通話タイムアウト（秒）
              </label>
              <input
                type="number"
                name="callTimeout"
                value={settings.callTimeout}
                onChange={handleChange}
                min="10"
                max="120"
                className="w-full border rounded-md shadow-sm p-2"
              />
            </div>
          </div>
        </div>

        {/* 営業時間設定 */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">営業時間設定</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                デフォルト開始時間
              </label>
              <input
                type="time"
                name="defaultWorkingHoursStart"
                value={settings.defaultWorkingHoursStart}
                onChange={handleChange}
                className="w-full border rounded-md shadow-sm p-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                デフォルト終了時間
              </label>
              <input
                type="time"
                name="defaultWorkingHoursEnd"
                value={settings.defaultWorkingHoursEnd}
                onChange={handleChange}
                className="w-full border rounded-md shadow-sm p-2"
              />
            </div>
          </div>
        </div>

        {/* 機能設定 */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">機能設定</h2>
          
          <div className="space-y-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="recordCalls"
                checked={settings.recordCalls}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">
                通話を録音する
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                name="enableSMS"
                checked={settings.enableSMS}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">
                SMS機能を有効にする
              </label>
            </div>
            
            {settings.enableSMS && (
              <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SMSプロバイダー
                  </label>
                  <select
                    name="smsProvider"
                    value={settings.smsProvider}
                    onChange={handleChange}
                    className="w-full border rounded-md shadow-sm p-2"
                  >
                    <option value="">選択してください</option>
                    <option value="twilio">Twilio</option>
                    <option value="aws">AWS SNS</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API キー
                  </label>
                  <input
                    type="password"
                    name="smsApiKey"
                    value={settings.smsApiKey}
                    onChange={handleChange}
                    className="w-full border rounded-md shadow-sm p-2"
                    placeholder="APIキーを入力"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {saving ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                保存中...
              </span>
            ) : (
              <span className="flex items-center">
                <Save className="h-5 w-5 mr-1" />
                設定を保存
              </span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SystemSettings;