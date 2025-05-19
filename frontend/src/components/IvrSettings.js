// frontend/src/components/IVRSettings.js
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Music, 
  Play, 
  Pause, 
  Save, 
  Info, 
  AlertCircle, 
  Check, 
  X,
  HelpCircle
} from 'lucide-react';

// 音声ファイルタイプの定義
const AUDIO_TYPES = [
  { id: 'welcome', label: '挨拶メッセージ', description: '通話開始時の最初のメッセージ' },
  { id: 'menu', label: 'メニュー案内', description: '利用可能なオプションの説明' },
  { id: 'goodbye', label: '終了メッセージ', description: '通話終了時のメッセージ' },
  { id: 'error', label: 'エラーメッセージ', description: '無効な選択時のメッセージ' }
];

const IVRSettings = ({ campaignId }) => {
  // 状態管理
  const [audioFiles, setAudioFiles] = useState([]);
  const [campaignAudio, setCampaignAudio] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [uploadingType, setUploadingType] = useState(null);
  const [isPlaying, setIsPlaying] = useState(null);
  
  // ファイル選択用のref
  const fileInputRef = useRef();
  
  // オーディオ再生用のref
  const audioRef = useRef(new Audio());
  
  // API URLの設定
  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
  
  // コンポーネントマウント時にデータを取得
  useEffect(() => {
    fetchAudioSettings();
  }, [campaignId]);
  
  // 音声ファイルの再生を停止（アンマウント時や別の音声再生時）
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // IVR設定データを取得
  const fetchAudioSettings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 認証トークンの取得
      const token = localStorage.getItem('token');
      
      // 開発環境用のモックデータ（開発時のみ使用）
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        // モックデータをセット
        setTimeout(() => {
          setAudioFiles([
            { id: '1', name: '挨拶.mp3', filename: 'greeting.mp3', mimetype: 'audio/mp3' },
            { id: '2', name: 'メニュー案内.mp3', filename: 'menu.mp3', mimetype: 'audio/mp3' },
            { id: '3', name: '終了メッセージ.mp3', filename: 'goodbye.mp3', mimetype: 'audio/mp3' },
            { id: '4', name: 'エラー.mp3', filename: 'error.mp3', mimetype: 'audio/mp3' }
          ]);
          
          setCampaignAudio({
            welcome: '1',
            menu: '2',
            goodbye: '3',
            error: '4'
          });
          
          setLoading(false);
        }, 600);
        return;
      }
      
      // 全ての音声ファイルを取得
      const filesResponse = await fetch(`${apiBaseUrl}/audio`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!filesResponse.ok) {
        throw new Error('音声ファイルの取得に失敗しました');
      }
      
      const filesData = await filesResponse.json();
      setAudioFiles(filesData);
      
      // キャンペーンに紐づいた音声設定を取得
      const settingsResponse = await fetch(`${apiBaseUrl}/ivr/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!settingsResponse.ok) {
        throw new Error('IVR設定の取得に失敗しました');
      }
      
      const settingsData = await settingsResponse.json();
      setCampaignAudio(settingsData.audio || {});
      
      setLoading(false);
    } catch (error) {
      console.error('IVR設定取得エラー:', error);
      setError(error.message || 'IVR設定の取得中にエラーが発生しました');
      setLoading(false);
    }
  };

  // 音声ファイルをアップロード
  const handleFileUpload = async (event, audioType) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // ファイルタイプのチェック
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg'];
    if (!validTypes.includes(file.type)) {
      setError('サポートされていないファイル形式です。WAV、MP3、OGGのみアップロードできます。');
      return;
    }
    
    // ファイルサイズのチェック（25MB制限）
    if (file.size > 25 * 1024 * 1024) {
      setError('ファイルサイズが大きすぎます。25MB以下のファイルをアップロードしてください。');
      return;
    }
    
    setUploadingType(audioType);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // FormDataを作成
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, '')); // 拡張子を除いたファイル名
      formData.append('description', `${AUDIO_TYPES.find(type => type.id === audioType)?.label || audioType} - ${new Date().toLocaleString()}`);
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        setTimeout(() => {
          const newFileId = `mock-${Date.now()}`;
          
          // 新しい音声ファイルをリストに追加
          setAudioFiles(prev => [
            ...prev,
            {
              id: newFileId,
              name: file.name,
              filename: file.name,
              mimetype: file.type
            }
          ]);
          
          // キャンペーンの音声設定を更新
          setCampaignAudio(prev => ({
            ...prev,
            [audioType]: newFileId
          }));
          
          setSuccessMessage('音声ファイルをアップロードしました');
          setUploadingType(null);
        }, 1000);
        return;
      }
      
      // 音声ファイルのアップロード
      const uploadResponse = await fetch(`${apiBaseUrl}/audio/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error('音声ファイルのアップロードに失敗しました');
      }
      
      const uploadedFile = await uploadResponse.json();
      
      // 音声ファイルリストを更新
      setAudioFiles(prev => [...prev, uploadedFile]);
      
      // キャンペーンに音声ファイルを割り当て
      const assignResponse = await fetch(`${apiBaseUrl}/ivr/campaigns/${campaignId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          config: {
            audioType: audioType,
            audioFileId: uploadedFile.id
          }
        })
      });
      
      if (!assignResponse.ok) {
        throw new Error('キャンペーンへの音声割り当てに失敗しました');
      }
      
      // キャンペーン音声設定を更新
      setCampaignAudio(prev => ({
        ...prev,
        [audioType]: uploadedFile.id
      }));
      
      setSuccessMessage('音声ファイルをアップロードしました');
    } catch (error) {
      console.error('音声アップロードエラー:', error);
      setError(error.message || '音声ファイルのアップロード中にエラーが発生しました');
    } finally {
      setUploadingType(null);
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 既存の音声ファイルをキャンペーンに割り当て
  const assignAudioToType = async (audioId, audioType) => {
    if (!audioId || !audioType) return;
    
    setUploadingType(audioType);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        setTimeout(() => {
          setCampaignAudio(prev => ({
            ...prev,
            [audioType]: audioId
          }));
          
          setSuccessMessage(`${AUDIO_TYPES.find(type => type.id === audioType)?.label || audioType}を更新しました`);
          setUploadingType(null);
        }, 500);
        return;
      }
      
      // キャンペーンに音声ファイルを割り当て
      const response = await fetch(`${apiBaseUrl}/ivr/campaigns/${campaignId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          config: {
            audioType: audioType,
            audioFileId: audioId
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('キャンペーンへの音声割り当てに失敗しました');
      }
      
      // キャンペーン音声設定を更新
      setCampaignAudio(prev => ({
        ...prev,
        [audioType]: audioId
      }));
      
      setSuccessMessage(`${AUDIO_TYPES.find(type => type.id === audioType)?.label || audioType}を更新しました`);
    } catch (error) {
      console.error('音声割り当てエラー:', error);
      setError(error.message || '音声の割り当て中にエラーが発生しました');
    } finally {
      setUploadingType(null);
    }
  };

  // 音声ファイルの再生/停止
  const togglePlayAudio = async (audioId) => {
    if (isPlaying === audioId) {
      // 同じファイルが再生中の場合は停止
      audioRef.current.pause();
      setIsPlaying(null);
      return;
    }
    
    // 再生中の音声があれば停止
    if (isPlaying) {
      audioRef.current.pause();
    }
    
    try {
      const token = localStorage.getItem('token');
      const audioFile = audioFiles.find(file => file.id === audioId);
      
      if (!audioFile) {
        setError('音声ファイルが見つかりません');
        return;
      }
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        // モック音声ファイルのURLを設定（実際のファイルがなくても良いよう短いサンプル音を使用）
        audioRef.current.src = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU9vT18AAAAAAA==';
        audioRef.current.play();
        setIsPlaying(audioId);
        
        // 3秒後に自動停止（モック用）
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(null);
          }
        }, 3000);
        return;
      }
      
      // 実際の音声ファイルのURLを設定
      const audioUrl = `${apiBaseUrl}/audio/${audioId}/stream`;
      audioRef.current.src = audioUrl;
      
      // 音声ファイルのロード中にヘッダーを設定
      audioRef.current.onloadstart = () => {
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
          if (url === audioUrl) {
            options.headers = {
              ...options.headers,
              'Authorization': `Bearer ${token}`
            };
          }
          return originalFetch(url, options);
        };
      };
      
      // イベントリスナーを設定
      audioRef.current.onended = () => setIsPlaying(null);
      audioRef.current.onerror = () => {
        setError('音声ファイルの再生に失敗しました');
        setIsPlaying(null);
      };
      
      // 再生を開始
      audioRef.current.play();
      setIsPlaying(audioId);
      
      // 元のfetch関数を復元
      const originalFetch = window.fetch;
      window.fetch = originalFetch;
    } catch (error) {
      console.error('音声再生エラー:', error);
      setError('音声ファイルの再生中にエラーが発生しました');
      setIsPlaying(null);
    }
  };

  // ファイル選択ダイアログを開く
  const openFileDialog = (audioType) => {
    setUploadingType(audioType);
    fileInputRef.current.click();
  };

  // 選択した音声ファイルの名前を取得
  const getSelectedAudioName = (audioType) => {
    const audioId = campaignAudio[audioType];
    if (!audioId) return 'ファイルが選択されていません';
    
    const audioFile = audioFiles.find(file => file.id === audioId);
    return audioFile ? audioFile.name : 'ファイルが見つかりません';
  };

  // IVRスクリプトを生成
  const generateIvrScript = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        setTimeout(() => {
          setSuccessMessage('IVRスクリプトが正常に生成されました');
          setLoading(false);
        }, 1000);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/ivr/campaigns/${campaignId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('IVRスクリプト生成に失敗しました');
      }
      
      setSuccessMessage('IVRスクリプトが正常に生成されました');
    } catch (error) {
      console.error('IVRスクリプト生成エラー:', error);
      setError(error.message || 'IVRスクリプトの生成中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // IVRスクリプトをデプロイ
  const deployIvrScript = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        setTimeout(() => {
          setSuccessMessage('IVRスクリプトが正常にデプロイされました');
          setLoading(false);
        }, 1500);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/ivr/campaigns/${campaignId}/deploy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('IVRスクリプトデプロイに失敗しました');
      }
      
      setSuccessMessage('IVRスクリプトが正常にデプロイされました');
    } catch (error) {
      console.error('IVRスクリプトデプロイエラー:', error);
      setError(error.message || 'IVRスクリプトのデプロイ中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="ml-3">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-6 flex items-center">
        <Music className="h-6 w-6 mr-2 text-blue-500" />
        IVR（自動音声応答）設定
      </h2>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
          <button 
            className="ml-auto text-red-700 hover:text-red-900"
            onClick={() => setError(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 flex items-center">
          <Check className="h-5 w-5 mr-2 flex-shrink-0" />
          <div>{successMessage}</div>
          <button 
            className="ml-auto text-green-700 hover:text-green-900"
            onClick={() => setSuccessMessage(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
        <div className="flex">
          <Info className="h-5 w-5 text-blue-500 mr-2" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">IVR（自動音声応答）とは？</p>
            <p className="mt-1">顧客が電話をかけてきたときに自動的に応答し、音声メッセージを再生したり、キー入力に応じて異なる対応を行うシステムです。以下の音声ファイルをアップロードして、自動応答の内容をカスタマイズできます。</p>
          </div>
        </div>
      </div>
      
      {/* 音声ファイル設定セクション */}
      <div className="mb-8">
        <h3 className="text-lg font-medium mb-4">音声ファイル設定</h3>
        
        <div className="grid gap-6">
          {AUDIO_TYPES.map((audioType) => (
            <div 
              key={audioType.id} 
              className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div className="mb-4 md:mb-0">
                  <div className="flex items-center">
                    <h4 className="font-medium text-gray-800">{audioType.label}</h4>
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {audioType.id}
                    </span>
                    <HelpCircle 
                      className="h-4 w-4 text-gray-400 ml-1 cursor-help"
                      title={audioType.description}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{audioType.description}</p>
                  
                  <div className="mt-2">
                    <p className="text-sm">
                      <span className="font-medium">選択中:</span> {getSelectedAudioName(audioType.id)}
                    </p>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  {campaignAudio[audioType.id] && (
                    <button
                      type="button"
                      onClick={() => togglePlayAudio(campaignAudio[audioType.id])}
                      className={`flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium ${
                        isPlaying === campaignAudio[audioType.id]
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                      disabled={uploadingType === audioType.id}
                    >
                      {isPlaying === campaignAudio[audioType.id] ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          停止
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          再生
                        </>
                      )}
                    </button>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => openFileDialog(audioType.id)}
                    className="flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={uploadingType === audioType.id}
                  >
                    {uploadingType === audioType.id ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-1 border-2 border-white border-opacity-20 border-t-white rounded-full"></div>
                        アップロード中...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-1" />
                        アップロード
                      </>
                    )}
                  </button>
                  
                  {audioFiles.length > 0 && (
                    <select
                      className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      value={campaignAudio[audioType.id] || ''}
                      onChange={(e) => assignAudioToType(e.target.value, audioType.id)}
                      disabled={uploadingType === audioType.id}
                    >
                      <option value="">既存の音声から選択</option>
                      {audioFiles.map(file => (
                        <option key={file.id} value={file.id}>
                          {file.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* 隠しファイル入力 */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="audio/wav, audio/mpeg, audio/mp3, audio/ogg"
          onChange={(e) => handleFileUpload(e, uploadingType)}
        />
      </div>
      
      {/* IVRスクリプト管理 */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium mb-4">IVRスクリプト管理</h3>
        
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <Info className="h-5 w-5 text-yellow-500 mr-2" />
            <div className="text-sm text-yellow-700">
              <p>音声ファイルを設定後、スクリプトの生成とデプロイを行うことで、IVRシステムが実際に動作するようになります。</p>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={generateIvrScript}
            className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-opacity-20 border-t-white rounded-full"></div>
                処理中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                スクリプト生成
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={deployIvrScript}
            className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-opacity-20 border-t-white rounded-full"></div>
                処理中...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                デプロイ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IVRSettings;