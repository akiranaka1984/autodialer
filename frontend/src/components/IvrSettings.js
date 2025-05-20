import React, { useState, useEffect } from 'react';
import { Mic, Save, PlayCircle, Download, Upload, AlertCircle, FileText, Music } from 'lucide-react';

// APIベースURLの取得 - 環境変数がない場合は相対パスを使用
const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || '/api';
};

const IVRSettings = ({ campaignId }) => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({
    welcomeMessage: '電話に出ていただきありがとうございます。',
    menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
    transferExtension: '1',
    dncOption: '9',
    maxRetries: 3,
    timeoutSeconds: 10,
    goodbyeMessage: 'お電話ありがとうございました。'
  });
  const [script, setScript] = useState('');
  const [audio, setAudio] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [audioFiles, setAudioFiles] = useState([]);
  const [selectedAudioType, setSelectedAudioType] = useState('welcome');

  // 利用可能な音声タイプ
  const audioTypes = [
    { id: 'welcome', name: '初期挨拶' },
    { id: 'menu', name: 'メニュー案内' },
    { id: 'goodbye', name: '終了メッセージ' },
    { id: 'error', name: 'エラーメッセージ' }
  ];

  useEffect(() => {
    fetchIVRSettings();
    fetchAudioFiles();
  }, [campaignId]);

  const fetchIVRSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/ivr/campaigns/${campaignId}`;
      console.log('IVR設定取得APIリクエスト:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('IVR設定取得エラー:', response.status, errorText);
        
        if (response.status === 404) {
          throw new Error('IVR設定が見つかりません。新規作成してください。');
        } else {
          throw new Error(`IVR設定の取得に失敗しました (${response.status})`);
        }
      }
      
      const data = await response.json();
      console.log('取得したIVR設定データ:', data);
      
      if (data.config) {
        setConfig(data.config);
      }
      
      if (data.script) {
        setScript(data.script);
      }
      
      if (data.audio) {
        setAudio(data.audio);
      }
      
    } catch (err) {
      console.error('IVR設定取得エラー:', err);
      setError(err.message || 'IVR設定の取得中にエラーが発生しました');
      // デフォルト設定はそのまま使用
    } finally {
      setLoading(false);
    }
  };

  const fetchAudioFiles = async () => {
    try {
      setError(null);
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/audio`;
      console.log('音声ファイル取得APIリクエスト:', apiUrl);
      
      const response = await fetch(apiUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('音声ファイル取得エラー:', response.status, errorText);
        throw new Error(`音声ファイルの取得に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('取得した音声ファイルデータ:', data);
      
      // データが配列であることを確認
      if (Array.isArray(data)) {
        setAudioFiles(data);
      } else {
        console.warn('予期しない音声ファイルデータ形式:', data);
        setAudioFiles([]);
      }
    } catch (err) {
      console.error('音声ファイル取得エラー:', err);
      // エラーは表示せず、空の配列を設定
      setAudioFiles([]);
    }
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/ivr/campaigns/${campaignId}`;
      console.log('IVR設定保存APIリクエスト:', apiUrl, 'メソッド: POST');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          config,
          script
        })
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('IVR設定保存エラー:', response.status, errorText);
        throw new Error(`IVR設定の保存に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('IVR設定保存レスポンス:', data);
      
      setSuccess('IVR設定を保存しました');
      
      // 最新の設定を取得
      await fetchIVRSettings();
      
    } catch (err) {
      console.error('IVR設定保存エラー:', err);
      setError(err.message || 'IVR設定の保存中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateScript = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/ivr/campaigns/${campaignId}/generate`;
      console.log('IVRスクリプト生成APIリクエスト:', apiUrl, 'メソッド: POST');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          config
        })
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('IVRスクリプト生成エラー:', response.status, errorText);
        throw new Error(`IVRスクリプトの生成に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('IVRスクリプト生成レスポンス:', data);
      
      if (data.script) {
        setScript(data.script);
      }
      
      setSuccess('IVRスクリプトを生成しました');
      
    } catch (err) {
      console.error('IVRスクリプト生成エラー:', err);
      setError(err.message || 'IVRスクリプトの生成中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeployScript = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/ivr/campaigns/${campaignId}/deploy`;
      console.log('IVRスクリプトデプロイAPIリクエスト:', apiUrl, 'メソッド: POST');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({}) // 空のJSONオブジェクトを送信
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('IVRスクリプトデプロイエラー:', response.status, errorText);
        throw new Error(`IVRスクリプトのデプロイに失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('IVRスクリプトデプロイレスポンス:', data);
      
      setSuccess('IVRスクリプトをデプロイしました');
      
    } catch (err) {
      console.error('IVRスクリプトデプロイエラー:', err);
      setError(err.message || 'IVRスクリプトのデプロイ中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestCall = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      
      // 電話番号入力ダイアログ
      const phoneNumber = prompt('テスト発信先の電話番号を入力してください:');
      
      if (!phoneNumber) {
        setIsSaving(false);
        return;
      }
      
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/ivr/test-call/${campaignId}`;
      console.log('テスト発信APIリクエスト:', apiUrl, 'メソッド: POST');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          phoneNumber
        })
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('テスト発信エラー:', response.status, errorText);
        throw new Error(`テスト発信に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('テスト発信レスポンス:', data);
      
      setSuccess(`${phoneNumber} にテスト発信を開始しました`);
      
    } catch (err) {
      console.error('テスト発信エラー:', err);
      setError(err.message || 'テスト発信中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignAudio = async (audioId) => {
    try {
      setIsSaving(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      
      const apiUrl = `${getApiBaseUrl()}/audio/assign`;
      console.log('音声ファイル割り当てAPIリクエスト:', apiUrl, 'メソッド: POST');
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          campaignId,
          audioId,
          audioType: selectedAudioType
        })
      });
      
      if (!response.ok) {
        // エラーレスポンスをログに記録
        const errorText = await response.text();
        console.error('音声ファイル割り当てエラー:', response.status, errorText);
        throw new Error(`音声ファイルの割り当てに失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('音声ファイル割り当てレスポンス:', data);
      
      setSuccess(`${audioTypes.find(t => t.id === selectedAudioType)?.name || selectedAudioType}に音声ファイルを割り当てました`);
      
      // 最新の設定を取得
      await fetchIVRSettings();
      
    } catch (err) {
      console.error('音声ファイル割り当てエラー:', err);
      setError(err.message || '音声ファイルの割り当て中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
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
    <div>
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <p>{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IVR設定フォーム */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">IVR設定</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                初期挨拶メッセージ
              </label>
              <textarea
                name="welcomeMessage"
                value={config.welcomeMessage}
                onChange={handleConfigChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows="2"
              ></textarea>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                メニュー案内
              </label>
              <textarea
                name="menuOptions"
                value={config.menuOptions}
                onChange={handleConfigChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows="3"
              ></textarea>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  オペレーター転送キー
                </label>
                <input
                  type="text"
                  name="transferExtension"
                  value={config.transferExtension}
                  onChange={handleConfigChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  DNC登録キー
                </label>
                <input
                  type="text"
                  name="dncOption"
                  value={config.dncOption}
                  onChange={handleConfigChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  最大リトライ回数
                </label>
                <input
                  type="number"
                  name="maxRetries"
                  value={config.maxRetries}
                  onChange={handleConfigChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タイムアウト（秒）
                </label>
                <input
                  type="number"
                  name="timeoutSeconds"
                  value={config.timeoutSeconds}
                  onChange={handleConfigChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                終了メッセージ
              </label>
              <textarea
                name="goodbyeMessage"
                value={config.goodbyeMessage}
                onChange={handleConfigChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                rows="2"
              ></textarea>
            </div>
          </div>
          
          <div className="mt-6 flex space-x-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              設定を保存
            </button>
            
            <button
              type="button"
              onClick={handleGenerateScript}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              <FileText className="h-4 w-4 mr-2" />
              スクリプト生成
            </button>
          </div>
        </div>
        
        {/* 音声ファイル割り当て */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">音声ファイル割り当て</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              音声タイプ
            </label>
            <select
              value={selectedAudioType}
              onChange={(e) => setSelectedAudioType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {audioTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              現在の割り当て
            </label>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              {audio[selectedAudioType] ? (
                <div className="flex items-center">
                  <Music className="h-5 w-5 text-blue-500 mr-2" />
                  <span>
                    {audioFiles.find(f => f.id === audio[selectedAudioType])?.name || '不明なファイル'}
                  </span>
                </div>
              ) : (
                <span className="text-gray-500">割り当てなし</span>
              )}
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              音声ファイル一覧
            </label>
            
            {audioFiles.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center">
                <p className="text-gray-500">音声ファイルがありません</p>
                <p className="text-sm text-gray-400 mt-1">音声ファイル管理から追加してください</p>
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto border border-gray-200 rounded">
                <ul className="divide-y divide-gray-200">
                  {audioFiles.map(file => (
                    <li key={file.id} className="p-3 hover:bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <Music className="h-5 w-5 text-blue-500 mr-2" />
                          <span>{file.name}</span>
                        </div>
                        <button
                          onClick={() => handleAssignAudio(file.id)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          割り当て
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <div className="mt-6 flex space-x-3">
            <button
              type="button"
              onClick={handleDeployScript}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <Upload className="h-4 w-4 mr-2" />
              デプロイ
            </button>
            
            <button
              type="button"
              onClick={handleTestCall}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              テスト発信
            </button>
          </div>
        </div>
      </div>
      
      {/* IVRスクリプト表示 */}
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">IVRスクリプト</h2>
        
        <div className="bg-gray-50 p-4 rounded border border-gray-200 font-mono text-sm overflow-x-auto">
          <pre>{script || '# スクリプトがありません。「スクリプト生成」ボタンをクリックしてください。'}</pre>
        </div>
      </div>
    </div>
  );
};

export default IVRSettings;