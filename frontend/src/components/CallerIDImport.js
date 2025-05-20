// frontend/src/components/CallerIDChannelImport.js
import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, Check, File } from 'lucide-react';

const CallerIDChannelImport = ({ callerId, callerNumber, onImportComplete, onCancel }) => {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState([]);
  const [mappings, setMappings] = useState({
    username: '',
    password: '',
    channel_type: ''
  });
  const [headers, setHeaders] = useState([]);
  const fileInputRef = useRef(null);

  // ファイル選択ハンドラ
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setMessage('CSVファイル形式のみアップロード可能です。');
      setStatus('error');
      return;
    }
    
    setFile(selectedFile);
    setStatus('idle');
    setMessage('');
    
    // CSVのプレビュー表示
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n');
      const rowsFiltered = rows.filter(row => row.trim() !== '');
      
      if (rowsFiltered.length === 0) {
        setMessage('CSVファイルにデータがありません。');
        setStatus('error');
        return;
      }
      
      const headers = rowsFiltered[0].split(',').map(header => header.trim());
      
      // ヘッダー行を設定
      setHeaders(headers);
      
      // 自動的にマッピングを試みる
      const possibleUsernameHeaders = ['ユーザー名', 'username', 'user', 'id', 'user_id'];
      const possiblePasswordHeaders = ['パスワード', 'password', 'pass', 'secret'];
      const possibleTypeHeaders = ['タイプ', 'type', 'channel_type', '用途', 'purpose'];
      
      const newMappings = { ...mappings };
      
      headers.forEach((header, index) => {
        const lowerHeader = header.toLowerCase();
        
        if (possibleUsernameHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.username = index.toString();
        }
        
        if (possiblePasswordHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.password = index.toString();
        }
        
        if (possibleTypeHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.channel_type = index.toString();
        }
      });
      
      // ヘッダーがない場合は、index値を自動設定
      const hasHeader = !/^\d+,/.test(rowsFiltered[0]) && 
        headers.some(h => isNaN(h) && !['outbound', 'transfer', 'both'].includes(h.toLowerCase()));
      
      if (!hasHeader) {
        // ヘッダーがない場合、デフォルトのマッピングを設定
        newMappings.username = "0";
        newMappings.password = "1";
        if (headers.length > 2) {
          newMappings.channel_type = "2";
        }
        
        // プレビューデータを設定（最大5行、1行目から）
        const previewRows = rowsFiltered.slice(0, 5).map(row => {
          return row.split(',').map(cell => cell.trim());
        }).filter(row => row.some(cell => cell));
        
        setPreview(previewRows);
      } else {
        // ヘッダーがある場合、2行目からデータを表示
        const previewRows = rowsFiltered.slice(1, 6).map(row => {
          return row.split(',').map(cell => cell.trim());
        }).filter(row => row.some(cell => cell));
        
        setPreview(previewRows);
      }
      
      setMappings(newMappings);
    };
    reader.readAsText(selectedFile);
  };

  // マッピング変更ハンドラ
  const handleMappingChange = (field, value) => {
    setMappings({
      ...mappings,
      [field]: value
    });
  };

  // ファイル選択ダイアログを開く
  const openFileDialog = () => {
    fileInputRef.current.click();
  };

  // インポート処理
  const handleImport = async () => {
    if (!file) {
      setMessage('アップロードするファイルを選択してください');
      setStatus('error');
      return;
    }
    
    if (!mappings.username || !mappings.password) {
      setMessage('ユーザー名とパスワードフィールドのマッピングは必須です');
      setStatus('error');
      return;
    }
    
    setStatus('loading');
    setProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mappings', JSON.stringify(mappings));
      
      const token = localStorage.getItem('token');
      
      // プログレスイベントを処理するための設定
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setProgress(progress);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            setMessage(`${response.importedCount || 0}件のチャンネルをインポートしました`);
            setStatus('success');
            
            setTimeout(() => {
              if (onImportComplete) {
                onImportComplete(response);
              }
            }, 1500);
          } catch (e) {
            setMessage('レスポンスの解析に失敗しました');
            setStatus('error');
          }
        } else {
          let errorMessage = 'チャンネルのインポートに失敗しました';
          try {
            const response = JSON.parse(xhr.responseText);
            errorMessage = response.message || errorMessage;
          } catch (e) {
            // レスポンスがJSONでない場合
          }
          setMessage(errorMessage);
          setStatus('error');
        }
      });
      
      xhr.addEventListener('error', () => {
        setMessage('ネットワークエラーが発生しました');
        setStatus('error');
      });
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
        console.log('開発環境でモックデータを使用 - チャンネルインポート処理');
        // モックデータのシミュレーション
        setTimeout(() => {
          setProgress(100);
          setStatus('success');
          setMessage('3件のチャンネルをインポートしました（モックモード）');
          
          if (onImportComplete) {
            onImportComplete({
              message: '3件のチャンネルをインポートしました',
              totalCount: 3,
              importedCount: 3,
              errors: []
            });
          }
        }, 1500);
        return;
      }
      
      // APIのベースURLを環境変数から取得
      const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
      
      xhr.open('POST', `${apiBaseUrl}/caller-ids/${callerId}/channels/import`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    } catch (error) {
      setMessage(`インポートエラー: ${error.message}`);
      setStatus('error');
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-2">チャンネルをインポート</h2>
      <p className="mb-4 text-sm text-gray-600">
        発信者番号 {callerNumber} のチャンネルをCSVからインポートします。
      </p>
      
      {message && (
        <div className={`p-4 mb-4 rounded-md ${
          status === 'error' ? 'bg-red-100 text-red-700 border-l-4 border-red-500' : 
          status === 'success' ? 'bg-green-100 text-green-700 border-l-4 border-green-500' : 
          'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
        }`}>
          <div className="flex">
            {status === 'error' && <AlertCircle className="h-5 w-5 mr-2" />}
            {status === 'success' && <Check className="h-5 w-5 mr-2" />}
            <p>{message}</p>
          </div>
        </div>
      )}
      
      <div className="mb-4">
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col w-full h-32 border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 cursor-pointer">
            <div className="flex flex-col items-center justify-center pt-7">
              <Upload className="w-10 h-10 text-gray-400" />
              <p className="pt-1 text-sm text-gray-600">
                {file ? file.name : 'CSVファイルをドラッグするか、クリックして選択してください'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".csv"
              onChange={handleFileChange}
              disabled={status === 'loading'}
            />
          </label>
        </div>
      </div>
      
      {/* プログレスバー */}
      {status === 'loading' && (
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm font-medium text-blue-700">インポート中...</span>
            <span className="text-sm font-medium text-blue-700">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {/* プレビューとマッピング */}
      {file && headers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2">CSVマッピング</h3>
          <p className="text-sm text-gray-500 mb-4">
            CSVの各列をチャンネルの属性にマッピングしてください。「*」は必須項目です。
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ユーザー名 *
              </label>
              <select
                value={mappings.username}
                onChange={(e) => handleMappingChange('username', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                required
              >
                <option value="">選択してください</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header} (列 {index+1})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                パスワード *
              </label>
              <select
                value={mappings.password}
                onChange={(e) => handleMappingChange('password', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                required
              >
                <option value="">選択してください</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header} (列 {index+1})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                チャンネル用途
              </label>
              <select
                value={mappings.channel_type}
                onChange={(e) => handleMappingChange('channel_type', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択 (デフォルト: 両方)</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header} (列 {index+1})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                用途の値は「outbound」「transfer」「both」のいずれかである必要があります
              </p>
            </div>
          </div>
          
          <h4 className="text-md font-semibold mb-2">プレビュー</h4>
          {preview.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map((header, index) => (
                      <th 
                        key={index}
                        scope="col"
                        className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                          index.toString() === mappings.username ? 'bg-blue-50' :
                          index.toString() === mappings.password ? 'bg-green-50' :
                          index.toString() === mappings.channel_type ? 'bg-yellow-50' : ''
                        }`}
                      >
                        {header}
                        <div className="text-xs font-normal mt-1">
                          {index.toString() === mappings.username && 'ユーザー名'}
                          {index.toString() === mappings.password && 'パスワード'}
                          {index.toString() === mappings.channel_type && 'チャンネル用途'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td 
                          key={cellIndex}
                          className={`px-6 py-4 whitespace-nowrap text-sm ${
                            cellIndex.toString() === mappings.username ? 'bg-blue-50' :
                            cellIndex.toString() === mappings.password ? 'bg-green-50' :
                            cellIndex.toString() === mappings.channel_type ? 'bg-yellow-50' : ''
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">プレビューデータがありません</p>
          )}
        </div>
      )}
      
      <div className="mt-6 bg-gray-50 p-4 rounded-md">
        <h4 className="text-sm font-medium text-gray-700 mb-2">CSVファイル形式について</h4>
        <p className="text-sm text-gray-600 mb-2">以下の列を含むCSVファイルを準備してください:</p>
        <pre className="bg-gray-100 p-2 rounded text-xs font-mono mb-2">
          username,password,channel_type<br />
          03080001,password123,outbound<br />
          03080002,password456,transfer<br />
          03080003,password789,both
        </pre>
        <ul className="list-disc text-xs text-gray-600 pl-5">
          <li><strong>ユーザー名</strong>（必須）: SIPアカウントのユーザー名</li>
          <li><strong>パスワード</strong>（必須）: SIPアカウントのパスワード</li>
          <li><strong>チャンネル用途</strong>（オプション）: 「outbound」（発信専用）、「transfer」（転送専用）、または「both」（両方）</li>
        </ul>
        <p className="text-xs text-gray-500 mt-2">※ヘッダー行はあってもなくても構いません</p>
      </div>
      
      <div className="flex justify-end space-x-3 mt-4">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          キャンセル
        </button>
        <button
          onClick={handleImport}
          disabled={!file || status === 'loading' || !mappings.username || !mappings.password}
          className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
            (!file || status === 'loading' || !mappings.username || !mappings.password) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {status === 'loading' ? 'インポート中...' : 'インポート実行'}
        </button>
      </div>
    </div>
  );
};

export default CallerIDChannelImport;