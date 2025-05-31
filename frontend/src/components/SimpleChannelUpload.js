// frontend/src/components/SimpleChannelUpload.js
import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, Check, File } from 'lucide-react';

// この単純版コンポーネントは、既存のモーダルから直接使用できます
const SimpleChannelUpload = ({ callerId, callerNumber, onImportComplete, onCancel }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // ファイル選択ハンドラ
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setError('CSVファイル形式のみアップロード可能です。');
      return;
    }
    
    setFile(selectedFile);
    setError(null);
  };

  // アップロードボタンクリック時の処理
  const handleUpload = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      // 基本的なマッピングを設定（0列目がusername、1列目がpassword、2列目がchannel_type）
      formData.append('mappings', JSON.stringify({
        username: "0",
        password: "1",
        channel_type: "2"
      }));

      const response = await fetch(`${process.env.REACT_APP_API_URL}/caller-ids/${callerId}/channels/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `インポートに失敗しました (${response.status})`);
      }

      const data = await response.json();
      setSuccess(true);
      setError(null);
      
      // 成功メッセージを表示して、一定時間後に完了コールバックを呼び出す
      setTimeout(() => {
        if (onImportComplete) {
          onImportComplete(data);
        }
      }, 1500);
    } catch (err) {
      console.error('インポートエラー:', err);
      setError(err.message);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  // ファイル選択ダイアログを開く
  const openFileDialog = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h3 className="text-lg font-semibold mb-2">CSVからチャンネルをインポート</h3>
      <p className="mb-4 text-sm text-gray-600">
        発信者番号 {callerNumber} のチャンネルをCSVファイルからインポートします。
      </p>

      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* 成功メッセージ */}
      {success && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4">
          <div className="flex">
            <Check className="h-5 w-5 mr-2" />
            <div>チャンネルのインポートが完了しました</div>
          </div>
        </div>
      )}

      {/* ファイル選択・ドラッグ&ドロップエリア */}
      <div 
        onClick={openFileDialog}
        className={`border-2 border-dashed rounded-lg p-6 mb-4 text-center cursor-pointer ${
          file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv"
          onChange={handleFileChange}
          disabled={loading}
        />
        
        {file ? (
          <div className="flex items-center justify-center">
            <File className="h-8 w-8 text-green-500 mr-2" />
            <span className="font-medium">{file.name}</span>
          </div>
        ) : (
          <div>
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              クリックしてCSVファイルを選択してください
            </p>
          </div>
        )}
      </div>

      {/* CSVフォーマットの説明 */}
      <div className="bg-gray-50 p-3 rounded mb-4">
        <h4 className="text-sm font-medium mb-2">CSVフォーマット（列の順序）:</h4>
        <pre className="text-xs font-mono bg-gray-100 p-2 rounded">
          ユーザー名,パスワード,チャンネル用途<br />
          03080001,password123,outbound<br />
          03080002,password456,transfer<br />
          03080003,password789,both
        </pre>
        <p className="text-xs text-gray-500 mt-2">
          ※ユーザー名、パスワードは必須です<br />
          ※チャンネル用途は、outbound/transfer/both のいずれかを指定（省略可）
        </p>
      </div>

      {/* アクションボタン */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          キャンセル
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className={`px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white ${
            !file || loading 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'
          }`}
        >
          {loading ? 'インポート中...' : 'インポート'}
        </button>
      </div>
    </div>
  );
};

export default SimpleChannelUpload;