// frontend/src/components/AudioManagement.js
import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Play, Pause, Volume2, Info, Plus, Check, AlertCircle } from 'lucide-react';

const AudioManagement = ({ campaignId = null }) => {
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [playingId, setPlayingId] = useState(null);
  const [assignModal, setAssignModal] = useState(false);
  const [assignType, setAssignType] = useState('');
  const [campaignAudio, setCampaignAudio] = useState({});
  
  const audioRef = useRef(null);
  
  // 環境変数からAPIのベースURLを取得
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  
  // ファイル一覧を取得
  useEffect(() => {
    fetchAudioFiles();
    
    // キャンペーンIDが指定されている場合、そのキャンペーンの音声設定も取得
    if (campaignId) {
      fetchCampaignAudio();
    }
  }, [campaignId]);
  
  const fetchAudioFiles = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モックデータを設定
        setTimeout(() => {
          const mockData = [
            { id: 'audio-1', name: 'ようこそメッセージ', filename: 'welcome.wav', mimetype: 'audio/wav', size: 24680, created_at: '2025-05-10T09:00:00Z' },
            { id: 'audio-2', name: 'オプション案内', filename: 'menu-options.mp3', mimetype: 'audio/mpeg', size: 36420, created_at: '2025-05-10T10:30:00Z' },
            { id: 'audio-3', name: 'お問い合わせありがとう', filename: 'thank-you.wav', mimetype: 'audio/wav', size: 18240, created_at: '2025-05-09T14:15:00Z' }
          ];
          setAudioFiles(mockData);
          setLoading(false);
        }, 500);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/audio`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('音声ファイルの取得に失敗しました');
      }
      
      const data = await response.json();
      setAudioFiles(data);
      setError(null);
    } catch (err) {
      console.error('API呼び出しエラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // キャンペーンの音声設定を取得
  const fetchCampaignAudio = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モックデータを設定
        setTimeout(() => {
          const mockData = {
            welcome: 'audio-1',
            menu: 'audio-2',
            goodbye: 'audio-3'
          };
          setCampaignAudio(mockData);
        }, 700);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/audio`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        // エラーでも続行（設定がない場合もあるため）
        console.warn('キャンペーン音声設定の取得に失敗しました');
        return;
      }
      
      const data = await response.json();
      
      // 音声タイプごとにマッピング
      const audioMap = {};
      data.forEach(audio => {
        audioMap[audio.audio_type] = audio.id;
      });
      
      setCampaignAudio(audioMap);
    } catch (err) {
      console.error('音声設定取得エラー:', err);
    }
  };
  
  // ファイルアップロードハンドラ
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 音声ファイル形式のみを許可
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg'];
    if (!validTypes.includes(file.type)) {
      setError('サポートされている音声形式は WAV, MP3, OGG のみです');
      return;
    }
    
    setSelectedFile(file);
    setError(null);
  };
  
  // ファイルアップロード実行
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('アップロードするファイルを選択してください');
      return;
    }
    
    const name = prompt('この音声ファイルの名前を入力してください:', selectedFile.name.split('.')[0]);
    if (!name) return; // キャンセルされた場合
    
    const description = prompt('説明（オプション）:', '');
    
    setUploadStatus('uploading');
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', name);
      formData.append('description', description || '');
      
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // アップロードシミュレーション
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setUploadStatus('success');
            
            // モックデータに追加
            const newFile = {
              id: `audio-${Date.now()}`,
              name: name,
              filename: selectedFile.name,
              mimetype: selectedFile.type,
              size: selectedFile.size,
              description: description || '',
              created_at: new Date().toISOString()
            };
            
            setAudioFiles(prev => [newFile, ...prev]);
            setSelectedFile(null);
          }
        }, 300);
        return;
      }
      
      // XMLHttpRequestを使用してプログレスを取得
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadStatus('success');
          fetchAudioFiles(); // ファイル一覧を更新
          setSelectedFile(null);
        } else {
          setUploadStatus('error');
          setError('アップロードに失敗しました');
        }
      });
      
      xhr.addEventListener('error', () => {
        setUploadStatus('error');
        setError('ネットワークエラーが発生しました');
      });
      
      xhr.open('POST', `${apiBaseUrl}/audio/upload`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    } catch (err) {
      console.error('アップロードエラー:', err);
      setUploadStatus('error');
      setError(err.message);
    }
  };
  
  // ファイル削除
  const handleDelete = async (id) => {
    if (!window.confirm('この音声ファイルを削除してもよろしいですか？')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モックデータから削除
        setAudioFiles(prev => prev.filter(file => file.id !== id));
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/audio/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('ファイルの削除に失敗しました');
      }
      
      // 成功したら一覧から削除
      setAudioFiles(prev => prev.filter(file => file.id !== id));
    } catch (err) {
      console.error('ファイル削除エラー:', err);
      setError(err.message);
    }
  };
  
  // 音声再生
  const handlePlay = async (id, filename) => {
    try {
      if (playingId === id) {
        // 再生中の場合は停止
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        setPlayingId(null);
        return;
      }
      
      const token = localStorage.getItem('token');
      
      // 開発環境の場合はダミーの音声を再生
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // テスト用の音声ファイルを使用
        const audio = new Audio('/sample-audio.mp3');
        audioRef.current = audio;
        audio.onended = () => setPlayingId(null);
        
        setPlayingId(id);
        await audio.play();
        return;
      }
      
      // 音声ファイルのURLを取得
      const audioUrl = `${apiBaseUrl}/audio/${id}/stream`;
      
      // Audio要素で再生
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingId(null);
      
      // 認証ヘッダーを追加（必要に応じて）
      audioRef.current = audio;
      
      setPlayingId(id);
      await audio.play();
    } catch (err) {
      console.error('音声再生エラー:', err);
      setError('音声の再生に失敗しました');
      setPlayingId(null);
    }
  };
  
  // キャンペーンに音声を割り当て（モーダル表示）
  const handleAssignModal = (type) => {
    setAssignType(type);
    setAssignModal(true);
  };
  
  // 音声の割り当て実行
  const assignAudioToCampaign = async (audioId) => {
    if (!campaignId || !assignType) return;
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モック処理
        setCampaignAudio(prev => ({
          ...prev,
          [assignType]: audioId
        }));
        setAssignModal(false);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          audioId,
          audioType: assignType
        })
      });
      
      if (!response.ok) {
        throw new Error('音声の割り当てに失敗しました');
      }
      
      // 成功したら設定を更新
      setCampaignAudio(prev => ({
        ...prev,
        [assignType]: audioId
      }));
      
      setAssignModal(false);
    } catch (err) {
      console.error('音声割り当てエラー:', err);
      setError(err.message);
    }
  };
  
  // ファイルサイズの表示形式を整形
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };
  
  // 音声タイプの表示名を取得
  const getAudioTypeName = (type) => {
    const typeMap = {
      'welcome': '初期挨拶',
      'menu': 'メニュー案内',
      'goodbye': '終了メッセージ',
      'error': 'エラーメッセージ'
    };
    
    return typeMap[type] || type;
  };
  
  if (loading) {
    return <div className="text-center p-4">読み込み中...</div>;
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">音声ファイル管理</h2>
        <div className="flex space-x-2">
          <label className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">
            <Upload className="h-5 w-5 mr-2 inline-block" />
            ファイルを選択
            <input 
              type="file" 
              accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg" 
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {selectedFile && (
        <div className="mb-6 bg-gray-50 p-4 rounded-md border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center">
              <Volume2 className="h-5 w-5 text-gray-500 mr-2" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={uploadStatus === 'uploading'}
              className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 ${
                uploadStatus === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              アップロード
            </button>
          </div>
          
          {uploadStatus === 'uploading' && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
              <div 
                className="bg-blue-600 h-2.5 rounded-full" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          )}
          
          {uploadStatus === 'success' && (
            <div className="flex items-center text-green-600 mt-2">
              <Check className="h-5 w-5 mr-2" />
              <p>アップロードが完了しました</p>
            </div>
          )}
        </div>
      )}
      
      {/* キャンペーン音声設定（キャンペーンIDが提供されている場合） */}
      {campaignId && (
        <div className="mb-6 border rounded-md p-4">
          <h3 className="font-medium mb-2">キャンペーン音声設定</h3>
          <div className="space-y-2">
            {['welcome', 'menu', 'goodbye', 'error'].map((type) => (
              <div key={type} className="flex justify-between items-center p-2 border-b">
                <div>
                  <span className="font-medium">{getAudioTypeName(type)}</span>
                  {campaignAudio[type] && (
                    <div className="text-sm text-gray-600">
                      {audioFiles.find(f => f.id === campaignAudio[type])?.name || '不明なファイル'}
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  {campaignAudio[type] && (
                    <button
                      onClick={() => handlePlay(campaignAudio[type])}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      {playingId === campaignAudio[type] ? 
                        <Pause className="h-5 w-5 text-gray-700" /> : 
                        <Play className="h-5 w-5 text-gray-700" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleAssignModal(type)}
                    className="p-1 rounded hover:bg-gray-100"
                  >
                    <Plus className="h-5 w-5 text-blue-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 音声ファイル一覧 */}
      {audioFiles.length === 0 ? (
        <div className="text-center p-8 text-gray-500">
          <Volume2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>音声ファイルがありません</p>
          <p className="text-sm mt-1">上部の「ファイルを選択」ボタンからアップロードしてください</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名前</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ファイル</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">サイズ</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">アップロード日時</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {audioFiles.map((file) => (
                <tr key={file.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{file.name}</div>
                    {file.description && (
                      <div className="text-sm text-gray-500">{file.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{file.filename}</div>
                    <div className="text-xs text-gray-500">{file.mimetype}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatFileSize(file.size)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(file.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handlePlay(file.id, file.filename)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {playingId === file.id ? <Pause /> : <Play />}
                      </button>
                      {campaignId && (
                        <button 
                          onClick={() => {
                            setAssignType('welcome');
                            assignAudioToCampaign(file.id);
                          }}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Plus />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* 音声割り当てモーダル */}
      {assignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">
              {getAudioTypeName(assignType)}の音声を選択
            </h3>
            <div className="max-h-80 overflow-y-auto mb-4">
              {audioFiles.map(file => (
                <div 
                  key={file.id}
                  onClick={() => assignAudioToCampaign(file.id)}
                  className="flex items-center p-2 hover:bg-gray-100 cursor-pointer rounded"
                >
                  <Volume2 className="h-5 w-5 mr-2 text-gray-600" />
                  <div>
                    <div className="font-medium">{file.name}</div>
                    <div className="text-sm text-gray-500">{file.filename} ({formatFileSize(file.size)})</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setAssignModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioManagement;