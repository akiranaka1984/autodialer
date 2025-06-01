// frontend/src/components/IvrSettings.js - 修正版
import React, { useState, useEffect } from 'react';
import { Mic, Save, PlayCircle, Download, Upload, AlertCircle, FileText, Music, X } from 'lucide-react';
import AudioFileUploader from './AudioFileUploader';

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
  const [showUploader, setShowUploader] = useState(false);
  const [selectedUploaderType, setSelectedUploaderType] = useState(null);

  const audioTypes = [
    { id: 'welcome', name: '初期挨拶・メニュー案内（統合）' },
    { id: 'goodbye', name: '終了メッセージ' },
    { id: 'error', name: 'エラーメッセージ' }
  ];

  useEffect(() => {
    fetchIvrSettings();
    fetchAudioFiles();
  }, [campaignId]);

  const fetchIvrSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token'); 
      const apiBaseUrl = getApiBaseUrl();
      
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - IVR設定');
        
        setTimeout(() => {
          setConfig({
            welcomeMessage: '電話に出ていただきありがとうございます。',
            menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
            goodbyeMessage: 'お電話ありがとうございました。',
            transferExtension: '1',
            dncOption: '9',
            maxRetries: 3,
            timeoutSeconds: 10
          });
          setLoading(false);
        }, 500);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/ivr/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status}`);
      }
      
      const data = await response.json();
      setConfig(data.config || config);
      setScript(data.script || '');
      setAudio(data.audio || {});
    } catch (error) {
      console.error('IVR設定取得エラー:', error);
      setConfig({
        welcomeMessage: '電話に出ていただきありがとうございます。',
        menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
        goodbyeMessage: 'お電話ありがとうございました。',
        transferExtension: '1',
        dncOption: '9',
        maxRetries: 3,
        timeoutSeconds: 10
      });
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
        const errorText = await response.text();
        console.error('音声ファイル取得エラー:', response.status, errorText);
        throw new Error(`音声ファイルの取得に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('取得した音声ファイルデータ:', data);
      
      if (Array.isArray(data)) {
        setAudioFiles(data);
      } else {
        console.warn('予期しない音声ファイルデータ形式:', data);
        setAudioFiles([]);
      }
    } catch (err) {
      console.error('音声ファイル取得エラー:', err);
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
        const errorText = await response.text();
        console.error('IVR設定保存エラー:', response.status, errorText);
        throw new Error(`IVR設定の保存に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('IVR設定保存レスポンス:', data);
      
      setSuccess('IVR設定を保存しました');
      await fetchIvrSettings();
      
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
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
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

  // ✅ 修正版: IVRテスト発信メソッド
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
      
      // ✅ 修正: 正しいエンドポイントを使用
      const apiUrl = `${getApiBaseUrl()}/ivr/test-call`;
      console.log('IVRテスト発信APIリクエスト:', apiUrl, 'メソッド: POST');
      
      const requestBody = {
        phoneNumber: phoneNumber.replace(/[^\d]/g, ''), // 数字のみに変換
        campaignId: parseInt(campaignId), // 数値に変換
        callerID: null // デフォルト発信者番号を使用
      };
      
      console.log('IVRテスト発信リクエストボディ:', requestBody);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('IVRテスト発信レスポンス状態:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('IVRテスト発信エラー:', response.status, errorText);
        throw new Error(`IVRテスト発信に失敗しました (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      console.log('IVRテスト発信レスポンス:', data);
      
      if (data.success) {
        setSuccess(`${phoneNumber} にIVRテスト発信を開始しました (CallID: ${data.callId})`);
      } else {
        throw new Error(data.message || 'IVRテスト発信に失敗しました');
      }
      
    } catch (err) {
      console.error('IVRテスト発信エラー:', err);
      setError(err.message || 'IVRテスト発信中にエラーが発生しました');
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
        const errorText = await response.text();
        console.error('音声ファイル割り当てエラー:', response.status, errorText);
        throw new Error(`音声ファイルの割り当てに失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      console.log('音声ファイル割り当てレスポンス:', data);
      
      setSuccess(`${audioTypes.find(t => t.id === selectedAudioType)?.name || selectedAudioType}に音声ファイルを割り当てました`);
      
      await fetchIvrSettings();
      
    } catch (err) {
      console.error('音声ファイル割り当てエラー:', err);
      setError(err.message || '音声ファイルの割り当て中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const openUploader = (audioType) => {
    setSelectedUploaderType(audioType);
    setShowUploader(true);
  };

  const handleRemoveAudio = async (audioType) => {
  try {
    setIsSaving(true);
    setError(null);
    
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${getApiBaseUrl()}/audio/unassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        campaignId,
        audioType
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`音声ファイルの削除に失敗しました (${response.status})`);
    }
    
    // 音声割り当て状態を更新
    setAudio(prev => ({
      ...prev,
      [audioType]: null
    }));
    
    setSuccess(`${audioTypes.find(t => t.id === audioType)?.name || audioType}の音声ファイルを削除しました`);
    
    setTimeout(() => setSuccess(null), 3000);
    
  } catch (err) {
    console.error('音声ファイル削除エラー:', err);
    setError(err.message || '音声ファイルの削除中にエラーが発生しました');
  } finally {
    setIsSaving(false);
  }
};

  const handleAudioUploadSuccess = async (audioFile) => {
    console.log('音声ファイルアップロード成功:', audioFile);
    
    setAudioFiles(prev => [...prev, audioFile]);
    
    if (selectedUploaderType) {
      setAudio(prev => ({
        ...prev,
        [selectedUploaderType]: audioFile.id
      }));
    }
    
    setTimeout(() => {
      setShowUploader(false);
      setSelectedUploaderType(null);
      setSuccess(`${audioTypes.find(t => t.id === selectedUploaderType)?.name || selectedUploaderType}に音声ファイルを割り当てました`);
    }, 2000);
    
    await fetchIvrSettings();
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
          
          {showUploader ? (
            <div className="mb-4">
              <AudioFileUploader 
                campaignId={campaignId}
                audioType={selectedUploaderType}
                onUploadSuccess={handleAudioUploadSuccess}
              />
              <div className="mt-3">
                <button
                  onClick={() => setShowUploader(false)}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <X className="h-4 w-4 mr-1" />
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 mb-6">
                {audioTypes.map(type => (
                  <div key={type.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-700">{type.name}</h3>
                        <div className="mt-1">
                          {audio[type.id] ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Music className="h-4 w-4 text-blue-500 mr-1" />
                                <span className="text-sm text-gray-600">
                                  {audioFiles.find(f => f.id === audio[type.id])?.name || '不明なファイル'}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleRemoveAudio(type.id)}
                                  disabled={isSaving}
                                  className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs disabled:opacity-50"
                                  title="削除"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">割り当てなし</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => openUploader(type.id)}
                        disabled={isSaving}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm disabled:opacity-50"
                      >
                        {audio[type.id] ? '変更' : 'アップロード'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">既存の音声ファイル</h3>
                {audioFiles.length === 0 ? (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center">
                    <p className="text-gray-500">音声ファイルがありません</p>
                    <p className="text-sm text-gray-400 mt-1">上の「アップロード」ボタンから追加してください</p>
                  </div>
                ) : (
                  <div className="mb-4">
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        音声タイプを選択
                      </label>
                      <select
                        value={selectedAudioType}
                        onChange={(e) => setSelectedAudioType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        {audioTypes.map(type => (
                          <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="max-h-32 overflow-y-auto border border-gray-200 rounded">
                      <ul className="divide-y divide-gray-200">
                        {audioFiles.map(file => (
                          <li key={file.id} className="p-2 hover:bg-gray-50 text-sm">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center">
                                <Music className="h-4 w-4 text-blue-500 mr-2" />
                                <span className="truncate max-w-xs">{file.name}</span>
                              </div>
                              <button
                                onClick={() => handleAssignAudio(file.id)}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs"
                              >
                                割り当て
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          
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
