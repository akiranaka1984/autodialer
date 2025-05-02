// frontend/src/components/CallerIDImport.js
import React, { useState } from 'react';
import { Upload, AlertCircle, Check, File } from 'lucide-react';

const CallerIDImport = ({ onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState([]);
  const [mappings, setMappings] = useState({
    number: '',
    description: '',
    provider: '',
    sip_host: '',
    auth_username: '',
    auth_password: '',
    active: ''
  });
  const [headers, setHeaders] = useState([]);

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
      const headers = rows[0].split(',').map(header => header.trim());
      
      // ヘッダー行を設定
      setHeaders(headers);
      
      // 自動的にマッピングを試みる
      const possibleNumberHeaders = ['電話番号', '番号', 'number', 'phone', 'caller_id'];
      const possibleDescHeaders = ['説明', 'description', '名前', 'name'];
      const possibleProviderHeaders = ['プロバイダ', 'provider', 'service'];
      const possibleHostHeaders = ['SIPホスト', 'sip_host', 'host', 'server'];
      const possibleUsernameHeaders = ['ユーザー名', 'username', 'auth_username', 'user'];
      const possiblePasswordHeaders = ['パスワード', 'password', 'auth_password', 'secret'];
      const possibleActiveHeaders = ['有効', 'active', 'status', '状態'];
      
      const newMappings = { ...mappings };
      
      headers.forEach((header, index) => {
        const lowerHeader = header.toLowerCase();
        
        if (possibleNumberHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.number = index.toString();
        }
        
        if (possibleDescHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.description = index.toString();
        }
        
        if (possibleProviderHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.provider = index.toString();
        }
        
        if (possibleHostHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.sip_host = index.toString();
        }
        
        if (possibleUsernameHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.auth_username = index.toString();
        }
        
        if (possiblePasswordHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.auth_password = index.toString();
        }
        
        if (possibleActiveHeaders.some(h => lowerHeader.includes(h.toLowerCase()))) {
          newMappings.active = index.toString();
        }
      });
      
      setMappings(newMappings);
      
      // プレビューデータを設定（最大5行）
      const previewRows = rows.slice(1, 6).map(row => {
        return row.split(',').map(cell => cell.trim());
      }).filter(row => row.length === headers.length && row.some(cell => cell));
      
      setPreview(previewRows);
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

  // インポート処理
  const handleImport = async () => {
    if (!file) {
      setMessage('アップロードするファイルを選択してください');
      setStatus('error');
      return;
    }
    
    if (!mappings.number) {
      setMessage('電話番号フィールドのマッピングは必須です');
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
          const response = JSON.parse(xhr.responseText);
          setMessage(`${response.imported_count}件の発信者番号をインポートしました`);
          setStatus('success');
          
          if (onImportComplete) {
            onImportComplete();
          }
        } else {
          let errorMessage = '発信者番号のインポートに失敗しました';
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
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - インポート処理');
        // モックデータのセット
        setTimeout(() => {
          setProgress(100);
          setStatus('success');
          setMessage('3件の発信者番号をインポートしました（モックモード）');
          
          if (onImportComplete) {
            onImportComplete();
          }
        }, 1500);
        return;
      }
      
      xhr.open('POST', `${process.env.REACT_APP_API_URL}/caller-ids/import`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    } catch (error) {
      setMessage(`インポートエラー: ${error.message}`);
      setStatus('error');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-lg font-semibold mb-4">CSVからインポート</h2>
      
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
            CSVの各列を発信者番号の属性にマッピングしてください。「*」は必須項目です。
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                電話番号 *
              </label>
              <select
                value={mappings.number}
                onChange={(e) => handleMappingChange('number', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                required
              >
                <option value="">選択してください</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                説明
              </label>
              <select
                value={mappings.description}
                onChange={(e) => handleMappingChange('description', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                プロバイダ
              </label>
              <select
                value={mappings.provider}
                onChange={(e) => handleMappingChange('provider', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SIPホスト
              </label>
              <select
                value={mappings.sip_host}
                onChange={(e) => handleMappingChange('sip_host', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                認証ユーザー名
              </label>
              <select
                value={mappings.auth_username}
                onChange={(e) => handleMappingChange('auth_username', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                認証パスワード
              </label>
              <select
                value={mappings.auth_password}
                onChange={(e) => handleMappingChange('auth_password', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                有効/無効
              </label>
              <select
                value={mappings.active}
                onChange={(e) => handleMappingChange('active', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              >
                <option value="">未選択 (デフォルト: 有効)</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header}
                  </option>
                ))}
              </select>
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
                          index.toString() === mappings.number ? 'bg-blue-50' :
                          index.toString() === mappings.description ? 'bg-green-50' :
                          index.toString() === mappings.provider ? 'bg-yellow-50' : ''
                        }`}
                      >
                        {header}
                        <div className="text-xs font-normal mt-1">
                          {index.toString() === mappings.number && '電話番号'}
                          {index.toString() === mappings.description && '説明'}
                          {index.toString() === mappings.provider && 'プロバイダ'}
                          {index.toString() === mappings.sip_host && 'SIPホスト'}
                          {index.toString() === mappings.auth_username && 'ユーザー名'}
                          {index.toString() === mappings.auth_password && 'パスワード'}
                          {index.toString() === mappings.active && '有効/無効'}
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
                            cellIndex.toString() === mappings.number ? 'bg-blue-50' :
                            cellIndex.toString() === mappings.description ? 'bg-green-50' :
                            cellIndex.toString() === mappings.provider ? 'bg-yellow-50' : ''
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
      
      <div className="flex justify-end">
        <button
          onClick={handleImport}
          disabled={!file || status === 'loading' || !mappings.number}
          className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
            (!file || status === 'loading' || !mappings.number) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {status === 'loading' ? 'インポート中...' : 'インポート実行'}
        </button>
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        <h4 className="font-medium">CSVファイル形式について</h4>
        <p>以下のヘッダーを含むCSVファイルをご用意ください：</p>
        <ul className="list-disc pl-5 mt-1">
          <li>電話番号（必須）: 例「0312345678」（ハイフンなし）</li>
          <li>説明: 例「東京オフィス」</li>
          <li>プロバイダ: 例「SIP Provider A」</li>
          <li>SIPホスト: 例「sip.provider-a.com」</li>
          <li>認証ユーザー名: 例「tokyo_office」</li>
          <li>認証パスワード: 例「password123」</li>
          <li>有効/無効: 例「true」または「false」（空の場合は「true」）</li>
        </ul>
      </div>
    </div>
  );
};

export default CallerIDImport;