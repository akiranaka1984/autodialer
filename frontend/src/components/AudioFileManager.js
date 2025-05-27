// frontend/src/components/AudioFileManager.js
import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Play, 
  Pause, 
  Trash2, 
  AlertCircle, 
  Check, 
  X, 
  Info, 
  Download,
  Music
} from 'lucide-react';

const AudioFileManager = () => {
  // 状態管理
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(null);
  const [fileInfo, setFileInfo] = useState({
    name: '',
    description: ''
  });
  
  // ファイル選択用のref
  const fileInputRef = useRef();
  
  // オーディオ再生用のref
  const audioRef = useRef(new Audio());
  
  // API URLの設定
  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
  
  // コンポーネントマウント時にデータを取得
  useEffect(() => {
    fetchAudioFiles();
  }, []);
  
  // 音声ファイルの再生を停止（アンマウント時や別の音声再生時）
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // 音声ファイル一覧を取得
  const fetchAudioFiles = async () => {
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
            { 
              id: '1', 
              name: '挨拶.mp3', 
              filename: 'greeting.mp3', 
              mimetype: 'audio/mp3', 
              size: 524288, 
              created_at: '2025-05-15T10:30:00Z',
              description: '通話開始時の挨拶メッセージ'
            },
            { 
              id: '2', 
              name: 'メニュー案内.mp3', 
              filename: 'menu.mp3', 
              mimetype: 'audio/mp3', 
              size: 1048576, 
              created_at: '2025-05-15T11:15:00Z',
              description: 'オプションメニュー案内'
            },
            { 
              id: '3', 
              name: '終了メッセージ.mp3', 
              filename: 'goodbye.mp3', 
              mimetype: 'audio/mp3', 
              size: 262144, 
              created_at: '2025-05-16T09:45:00Z',
              description: '通話終了時のメッセージ'
            },
            { 
              id: '4', 
              name: 'エラー.mp3', 
              filename: 'error.mp3', 
              mimetype: 'audio/mp3', 
              size: 131072, 
              created_at: '2025-05-16T14:20:00Z',
              description: '無効な選択時のエラーメッセージ'
            }
          ]);
          setLoading(false);
        }, 600);
        return;
      }
      
      // 全ての音声ファイルを取得
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
      setLoading(false);
    } catch (error) {
      console.error('音声ファイル取得エラー:', error);
      setError(error.message || '音声ファイルの取得中にエラーが発生しました');
      setLoading(false);
    }
  };

  // 音声ファイルをアップロード
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // ファイルタイプのチェック
    const validTypes = ['audio/wav'];
    if (!validTypes.includes(file.type)) {
      setError('サポートされていないファイル形式です。WAVのみアップロードできます。');
      return;
    }
    
    // ファイルサイズのチェック（25MB制限）
    if (file.size > 25 * 1024 * 1024) {
      setError('ファイルサイズが大きすぎます。25MB以下のファイルをアップロードしてください。');
      return;
    }
    
    // ファイル情報入力モーダルを表示
    setFileInfo({
      name: file.name.replace(/\.[^/.]+$/, ''), // 拡張子を除いたファイル名
      description: ''
    });
    
    setUploading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // FormDataを作成
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', fileInfo.name || file.name.replace(/\.[^/.]+$/, ''));
      formData.append('description', fileInfo.description || `アップロード: ${new Date().toLocaleString()}`);
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        setTimeout(() => {
          const newFileId = `mock-${Date.now()}`;
          
          // 新しい音声ファイルをリストに追加
          setAudioFiles(prev => [
            ...prev,
            {
              id: newFileId,
              name: fileInfo.name || file.name.replace(/\.[^/.]+$/, ''),
              filename: file.name,
              mimetype: file.type,
              size: file.size,
              description: fileInfo.description || `アップロード: ${new Date().toLocaleString()}`,
              created_at: new Date().toISOString()
            }
          ]);
          
          setSuccessMessage('音声ファイルをアップロードしました');
          setUploading(false);
        }, 1000);
        return;
      }
      
      // 音声ファイルのアップロード
      const response = await fetch(`${apiBaseUrl}/audio/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('音声ファイルのアップロードに失敗しました');
      }
      
      const uploadedFile = await response.json();
      
      // 音声ファイルリストを更新
      setAudioFiles(prev => [...prev, uploadedFile]);
      
      setSuccessMessage('音声ファイルをアップロードしました');
    } catch (error) {
      console.error('音声アップロードエラー:', error);
      setError(error.message || '音声ファイルのアップロード中にエラーが発生しました');
    } finally {
      setUploading(false);
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 音声ファイルの削除
  const deleteAudioFile = async (id) => {
    if (!window.confirm('この音声ファイルを削除してもよろしいですか？キャンペーンに関連付けられている場合、影響が出る可能性があります。')) {
      return;
    }
    
    setError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境用のモック処理
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        setTimeout(() => {
          setAudioFiles(prev => prev.filter(file => file.id !== id));
          setSuccessMessage('音声ファイルを削除しました');
        }, 500);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/audio/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('音声ファイルの削除に失敗しました');
      }
      
      // 音声ファイルリストから削除
      setAudioFiles(prev => prev.filter(file => file.id !== id));
      
      // 再生中なら停止
      if (isPlaying === id) {
        audioRef.current.pause();
        setIsPlaying(null);
      }
      
      setSuccessMessage('音声ファイルを削除しました');
    } catch (error) {
      console.error('音声削除エラー:', error);
      setError(error.message || '音声ファイルの削除中にエラーが発生しました');
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

  // ファイルサイズを人間が読める形式に変換
  const formatFileSize = (bytes) => {
    if (!bytes) return '不明';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // 日付を整形
  const formatDate = (dateString) => {
    if (!dateString) return '不明';
    
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 🎵 音声テストボタン機能
  const testAudioPlayback = async (audioId) => {
    try {
      const token = localStorage.getItem('token');
      
      // APIエンドポイントのデバッグログ
      console.log('音声テスト開始:', { audioId, apiBaseUrl });
      
      const response = await fetch(`${apiBaseUrl}/audio/test-playback/${audioId}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('レスポンス状態:', response.status);
      
      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('テスト結果:', result);
      
      if (result.success) {
        setSuccessMessage('🔊 音声再生テスト成功！');
      } else {
        setError(`音声再生テストに失敗: ${result.message}`);
      }
    } catch (error) {
      console.error('音声テストエラー:', error);
      setError(`音声再生テストエラー: ${error.message}`);
    }
  };

  // ファイル選択ダイアログを開く
  const openFileDialog = () => {
    fileInputRef.current.click();
  };

  // ファイル情報の入力ハンドラ
  const handleFileInfoChange = (e) => {
    const { name, value } = e.target;
    setFileInfo(prev => ({
      ...prev,
      [name]: value
    }));
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
        音声ファイル管理
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
            <p className="font-medium">音声ファイルについて</p>
            <p className="mt-1">ここでは、IVR（自動音声応答）で使用する音声ファイルを管理できます。音声ファイルをアップロードし、キャンペーンのIVR設定で利用しましょう。</p>
            <p className="mt-1">サポートしているファイル形式: WAV, MP3, OGG（最大サイズ: 25MB）</p>
          </div>
        </div>
      </div>
      
      {/* アップロードボタン */}
      <div className="mb-6">
        <button
          type="button"
          onClick={openFileDialog}
          className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={uploading}
        >
          {uploading ? (
            <>
              <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-opacity-20 border-t-white rounded-full"></div>
              アップロード中...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              音声ファイルをアップロード
            </>
          )}
        </button>
        
        {/* 隠しファイル入力 */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="audio/wav, audio/mpeg, audio/mp3, audio/ogg"
          onChange={handleFileUpload}
        />
      </div>
      
      {/* ファイル情報入力モーダル */}
      {uploading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">音声ファイル情報</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
                ファイル名 *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                value={fileInfo.name}
                onChange={handleFileInfoChange}
                required
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="description">
                説明
              </label>
              <textarea
                id="description"
                name="description"
                rows="3"
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="例: 通話開始時の挨拶メッセージ"
                value={fileInfo.description}
                onChange={handleFileInfoChange}
              ></textarea>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setUploading(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleFileUpload}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={!fileInfo.name}
              >
                アップロード
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 音声ファイル一覧 */}
      {audioFiles.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ファイル名
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  説明
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  サイズ
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  作成日時
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  アクション
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {audioFiles.map(file => (
                <tr key={file.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Music className="h-5 w-5 text-gray-400 mr-2" />
                      <span className="font-medium text-gray-900">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">{file.description || '-'}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">{formatFileSize(file.size)}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">{formatDate(file.created_at)}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => testAudioPlayback(file.id)}
                        className="p-2 rounded-full bg-purple-100 text-purple-600 hover:bg-purple-200"
                        title="音声テスト"
                      >
                        🧪
                      </button>
                      <button
                        onClick={() => togglePlayAudio(file.id)}
                        className={`p-2 rounded-full ${
                          isPlaying === file.id 
                            ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                            : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        }`}
                        title={isPlaying === file.id ? '停止' : '再生'}
                      >
                        {isPlaying === file.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <a
                        href={`${apiBaseUrl}/audio/${file.id}/stream`}
                        download={file.name}
                        className="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200"
                        title="ダウンロード"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => deleteAudioFile(file.id)}
                        className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200"
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-50 p-6 text-center rounded-lg border border-gray-200">
          <Music className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <h3 className="text-lg font-medium text-gray-900">音声ファイルがありません</h3>
          <p className="mt-1 text-sm text-gray-500">
            IVRで使用する音声ファイルをアップロードしてください。
          </p>
          <button
            type="button"
            onClick={openFileDialog}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Upload className="h-4 w-4 mr-2" />
            音声ファイルをアップロード
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioFileManager;
