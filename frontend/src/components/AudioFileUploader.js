import React, { useState, useEffect } from 'react';
import { Mic, Upload, PlayCircle, X, AlertCircle, Music } from 'lucide-react';

// APIベースURLの取得 - 環境変数がない場合は相対パスを使用
const getApiBaseUrl = () => {
  return process.env.REACT_APP_API_URL || '/api';
};

const AudioFileUploader = ({ campaignId, audioType, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState(null);

  // オーディオタイプの日本語表示
  const audioTypeLabels = {
    welcome: '初期挨拶',
    menu: 'メニュー案内',
    error: 'エラーメッセージ',
    goodbye: '終了メッセージ'
  };

  // ファイル選択ハンドラ
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // ファイルタイプチェック
      const validTypes = ['audio/wav'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('サポートされていないファイル形式です。WAV、MP3、OGGのみ対応しています。');
        return;
      }
      
      // ファイルサイズチェック (25MB以下)
      if (selectedFile.size > 25 * 1024 * 1024) {
        setError('ファイルサイズが大きすぎます。25MB以下のファイルを選択してください。');
        return;
      }
      
      setFile(selectedFile);
      // デフォルトのファイル名を設定（拡張子なし）
      const name = selectedFile.name.replace(/\.[^/.]+$/, "");
      setFileName(name);
      setError(null);
      
      // 既存のオーディオをクリーンアップ
      if (audio) {
        audio.pause();
        URL.revokeObjectURL(audio.src);
      }
      
      // 新しいオーディオをセットアップ
      const newAudio = new Audio(URL.createObjectURL(selectedFile));
      newAudio.addEventListener('ended', () => setIsPlaying(false));
      setAudio(newAudio);
    }
  };

  // アップロードハンドラ
  const handleUpload = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }
    
    if (!fileName.trim()) {
      setError('ファイル名を入力してください');
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', fileName);
      formData.append('description', description);
      formData.append('audioType', audioType);
      formData.append('campaignId', campaignId);
      
      // APIのベースURL
      const apiBaseUrl = getApiBaseUrl();
      const token = localStorage.getItem('token');
      // トークンの存在をチェック
      if (!token) {
        console.error('認証トークンがありません');
        setError('認証エラー：ログインが必要です');
        return;
      }

      // ここにデバッグログを追加
    console.log('アップロードリクエスト情報:', {
      url: `${apiBaseUrl}/ivr/upload-audio`,
      token: token ? '設定済み' : '未設定',
      file: file ? {
        name: file.name,
        type: file.type,
        size: file.size
      } : 'なし',
      formData: {
        name: fileName,
        audioType,
        campaignId
      }
    });
      
      const response = await fetch(`${apiBaseUrl}/ivr/upload-audio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        
        try {
          if (contentType && contentType.includes('application/json')) {
            // JSONレスポンスの場合
            const errorData = await response.json();
            throw new Error(errorData.message || 'アップロードに失敗しました');
          } else {
            // テキスト（HTML）レスポンスの場合
            const errorText = await response.text();
            console.error('非JSONレスポンス:', {
              status: response.status,
              contentType,
              text: errorText.substring(0, 200) // 長すぎる場合は切り詰める
            });
            throw new Error(`アップロードに失敗しました (${response.status})`);
          }
        } catch (parseError) {
          if (parseError.name === 'SyntaxError') {
            // JSONパースエラーの場合
            console.error('レスポンス解析エラー:', parseError);
            throw new Error(`レスポンスの解析に失敗しました (${response.status})`);
          }
          // その他のエラーはそのまま再スロー
          throw parseError;
        }
      }
      
      const data = await response.json();
      setSuccess(true);
      
      // 親コンポーネントに成功を通知
      if (onUploadSuccess) {
        onUploadSuccess(data.audioFile);
      }
      
      // 3秒後に成功メッセージをクリア
      setTimeout(() => {
        setSuccess(false);
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };
  
  // 音声再生/停止トグル
  const togglePlay = () => {
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    
    setIsPlaying(!isPlaying);
  };
  
  // コンポーネント解除時のクリーンアップ
  useEffect(() => {
    return () => {
      if (audio) {
        audio.pause();
        URL.revokeObjectURL(audio.src);
      }
    };
  }, [audio]);

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-medium mb-3">
        {audioTypeLabels[audioType] || audioType} 音声ファイル
      </h3>
      
      {!file ? (
        // ファイル選択部分
        <div className="mb-4">
          <div className="flex items-center justify-center w-full">
            <label
              htmlFor={`audio-upload-${audioType}`}
              className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex flex-col items-center justify-center pt-3 pb-4">
                <Upload className="w-6 h-6 mb-1 text-gray-500" />
                <p className="mb-1 text-sm text-gray-500">
                  クリックでファイルを選択
                </p>
		<p className="text-xs text-gray-500">WAV (最大: 25MB)</p>
              </div>
              <input
                id={`audio-upload-${audioType}`}
                type="file"
                className="hidden"
                accept=".wav,audio/wav"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>
      ) : (
        // ファイル選択後の表示
        <>
          <div className="mb-4">
            <div className="flex items-center bg-blue-50 p-2 rounded-md">
              <Music className="h-5 w-5 text-blue-500 mr-2" />
              <span className="text-sm text-gray-700 truncate flex-1">
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
              </span>
              
              <button
                type="button"
                onClick={togglePlay}
                className="p-1 ml-2 text-gray-500 hover:text-blue-700"
                title={isPlaying ? "一時停止" : "再生"}
              >
                {isPlaying ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setFileName('');
                  if (audio) {
                    audio.pause();
                    URL.revokeObjectURL(audio.src);
                    setAudio(null);
                  }
                  setIsPlaying(false);
                }}
                className="p-1 ml-1 text-gray-500 hover:text-red-700"
                title="キャンセル"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* メタデータ入力 */}
          <div className="space-y-3 mb-4">
            <div>
              <label htmlFor={`file-name-${audioType}`} className="block text-xs font-medium text-gray-700 mb-1">
                ファイル名 *
              </label>
              <input
                type="text"
                id={`file-name-${audioType}`}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="ファイル名"
                required
              />
            </div>
            
            <div>
              <label htmlFor={`description-${audioType}`} className="block text-xs font-medium text-gray-700 mb-1">
                説明
              </label>
              <input
                type="text"
                id={`description-${audioType}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="任意の説明文"
              />
            </div>
          </div>
          
          {/* アップロードボタン */}
          <div>
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !fileName.trim()}
              className={`inline-flex justify-center items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                isUploading || !fileName.trim()
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  アップロード中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" />
                  アップロード
                </>
              )}
            </button>
          </div>
        </>
      )}
      
      {/* エラーまたは成功メッセージ */}
      {error && (
        <div className="mt-3 flex items-center text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="mt-3 flex items-center text-sm text-green-600">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 flex-shrink-0"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>アップロード完了！</span>
        </div>
      )}
    </div>
  );
};

export default AudioFileUploader;
