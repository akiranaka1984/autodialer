import React, { useState, useEffect } from 'react';
import { Upload, AlertCircle, Check, X, File } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';

const ContactsUpload = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  
  const [campaignName, setCampaignName] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [mappings, setMappings] = useState({
    phone: '',
    name: '',
    company: ''
  });
  const [headers, setHeaders] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCampaignData = async () => {
      try {
        const token = localStorage.getItem('token');
        
        if (process.env.NODE_ENV === 'development') {
          setTimeout(() => {
            setCampaignName('サンプルキャンペーン');
            setLoading(false);
          }, 500);
          return;
        }
        
        const response = await fetch(`/api/campaigns/${campaignId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('キャンペーン情報の取得に失敗しました');
        }
        
        const campaignData = await response.json();
        setCampaignName(campaignData.name);
      } catch (error) {
        setMessage(`エラー: ${error.message}`);
        setUploadStatus('error');
      } finally {
        setLoading(false);
      }
    };
    
    if (campaignId) {
      fetchCampaignData();
    }
  }, [campaignId]);

  // ファイル選択ハンドラ
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setMessage('CSVファイル形式のみアップロード可能です。');
      setUploadStatus('error');
      return;
    }
    
    setFile(selectedFile);
    setUploadStatus('idle');
    setMessage('');
    
    // CSVのプレビューを表示
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const rows = text.split('\n');
        const headers = rows[0].split(',').map(header => header.trim());
        
        setHeaders(headers);
        
        // 自動マッピング
        const newMappings = { ...mappings };
        headers.forEach((header, index) => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('電話') || lowerHeader.includes('phone') || lowerHeader.includes('tel')) {
            newMappings.phone = index.toString();
          }
          if (lowerHeader.includes('名前') || lowerHeader.includes('name')) {
            newMappings.name = index.toString();
          }
          if (lowerHeader.includes('会社') || lowerHeader.includes('company')) {
            newMappings.company = index.toString();
          }
        });
        
        setMappings(newMappings);
        
        // プレビューデータを設定
        const previewRows = rows.slice(1, 6)
          .map(row => row.split(',').map(cell => cell.trim()))
          .filter(row => row.length === headers.length && row.some(cell => cell));
        
        setPreview(previewRows);
      };
      reader.readAsText(selectedFile);
    } catch (error) {
      setMessage(`ファイル読み込みエラー: ${error.message}`);
      setUploadStatus('error');
    }
  };

  // マッピング変更ハンドラ
  const handleMappingChange = (field, value) => {
    setMappings({
      ...mappings,
      [field]: value
    });
  };

  // CSVアップロード処理
const handleUpload = async (file) => {
  try {
    setUploading(true);
    setError(null);
    
    // FormDataの作成
    const formData = new FormData();
    formData.append('file', file);
    formData.append('campaignId', campaignId);
    formData.append('skipFirstRow', skipFirstRow);
    formData.append('updateExisting', updateExisting);
    formData.append('skipDnc', skipDnc);
    formData.append('mappings', JSON.stringify(fieldMappings));
    
    console.log('アップロード情報:', {
      fileName: file.name,
      fileSize: file.size,
      campaignId,
      skipFirstRow,
      updateExisting,
      skipDnc,
      mappings: fieldMappings
    });
    
    // APIリクエスト
    const response = await fetch(`${apiBaseUrl}/contacts/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });
    
    // レスポンスの検証
    console.log('アップロードレスポンスステータス:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('アップロードエラーレスポンス:', errorText);
      
      let errorMessage = '連絡先のアップロードに失敗しました';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // JSONパースエラー、テキストをそのまま使用
      }
      
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('アップロード結果:', result);
    
    setUploadResults(result);
    setSuccessMessage(`${result.success}件の連絡先をアップロードしました`);
    
    // 再読み込み
    fetchContacts();
    
  } catch (error) {
    console.error('アップロード処理エラー:', error);
    setError(`エラー: ${error.message}`);
  } finally {
    setUploading(false);
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
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">連絡先のアップロード</h1>
      <h2 className="text-lg text-gray-600 mb-6">キャンペーン: {campaignName}</h2>
      
      {/* ステータスメッセージ */}
      {message && (
        <div className={`p-4 mb-6 rounded-md ${
          uploadStatus === 'error' ? 'bg-red-100 text-red-700 border-l-4 border-red-500' : 
          uploadStatus === 'success' ? 'bg-green-100 text-green-700 border-l-4 border-green-500' : 
          'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
        }`}>
          <div className="flex items-center">
            {uploadStatus === 'error' && <AlertCircle className="h-5 w-5 mr-2" />}
            {uploadStatus === 'success' && <Check className="h-5 w-5 mr-2" />}
            <p>{message}</p>
          </div>
        </div>
      )}
      
      {/* ファイルアップロードセクション */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">CSVファイルを選択</h3>
          <p className="text-gray-600 mb-4">
            連絡先リストをCSV形式でアップロードしてください。<br />
            必須フィールド: 電話番号<br />
            オプションフィールド: 名前、会社名
          </p>
          
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col w-full h-32 border-2 border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 cursor-pointer">
              <div className="flex flex-col items-center justify-center pt-7">
                <Upload className="w-10 h-10 text-gray-400" />
                <p className="pt-1 text-sm text-gray-600">
                  {file ? file.name : 'ファイルをドラッグするか、クリックして選択してください'}
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploadStatus === 'loading'}
              />
            </label>
          </div>
        </div>
        
        {/* プログレスバー */}
        {uploadStatus === 'loading' && (
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-blue-700">アップロード中...</span>
              <span className="text-sm font-medium text-blue-700">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
      
      {/* プレビューとマッピング */}
      {file && headers.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">CSVマッピング</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                電話番号 *
              </label>
              <select
                value={mappings.phone}
                onChange={(e) => handleMappingChange('phone', e.target.value)}
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
                名前
              </label>
              <select
                value={mappings.name}
                onChange={(e) => handleMappingChange('name', e.target.value)}
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
                会社名
              </label>
              <select
                value={mappings.company}
                onChange={(e) => handleMappingChange('company', e.target.value)}
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
                          index.toString() === mappings.phone ? 'bg-blue-50' :
                          index.toString() === mappings.name ? 'bg-green-50' :
                          index.toString() === mappings.company ? 'bg-yellow-50' : ''
                        }`}
                      >
                        {header}
                        <div className="text-xs font-normal mt-1">
                          {index.toString() === mappings.phone && '電話番号'}
                          {index.toString() === mappings.name && '名前'}
                          {index.toString() === mappings.company && '会社名'}
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
                            cellIndex.toString() === mappings.phone ? 'bg-blue-50' :
                            cellIndex.toString() === mappings.name ? 'bg-green-50' :
                            cellIndex.toString() === mappings.company ? 'bg-yellow-50' : ''
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
      
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => navigate(`/campaigns/${campaignId}`)}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
        >
          キャンセル
        </button>
        
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploadStatus === 'loading' || !mappings.phone}
          className={`px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
            (!file || uploadStatus === 'loading' || !mappings.phone) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {uploadStatus === 'loading' ? 'アップロード中...' : 'アップロード'}
        </button>
      </div>
    </div>
  );
};

export default ContactsUpload;