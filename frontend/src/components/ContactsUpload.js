// frontend/src/components/ContactsUpload.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, AlertCircle, Check, Info, X, FileText, Download } from 'lucide-react';
import Papa from 'papaparse';

const ContactsUpload = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  
  // 状態変数を定義
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [uploadResults, setUploadResults] = useState(null);
  const [contacts, setContacts] = useState([]);
  
  // アップロードオプション
  const [skipFirstRow, setSkipFirstRow] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [skipDnc, setSkipDnc] = useState(true);
  
  // フィールドマッピング
  const [fieldMappings, setFieldMappings] = useState({
    phone: 0,
    name: 1,
    company: 2,
    email: 3
  });
  
  // 環境変数からAPIのベースURLを取得
  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
  
  // コンタクト情報を取得
  const fetchContacts = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/contacts?limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('連絡先情報の取得に失敗しました');
      }
      
      const data = await response.json();
      setContacts(data.contacts || data || []);
    } catch (err) {
      console.error('連絡先取得エラー:', err);
      setError('連絡先情報の取得に失敗しました: ' + err.message);
    }
  };
  
  // キャンペーン情報を取得
  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('キャンペーン情報の取得に失敗しました');
        }
        
        const data = await response.json();
        setCampaign(data);
      } catch (err) {
        console.error('キャンペーン取得エラー:', err);
        setError('キャンペーン情報の取得に失敗しました: ' + err.message);
      }
    };
    
    fetchCampaign();
    fetchContacts();
  }, [campaignId, apiBaseUrl]);
  
  // ファイル選択時の処理
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setError(null);
    
    // ファイルプレビューを表示
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        Papa.parse(content, {
          complete: (results) => {
            // 最初の10行だけプレビュー表示
            setPreviewData(results.data.slice(0, 10));
          },
          error: (error) => {
            setError('CSVファイルの解析に失敗しました: ' + error.message);
          }
        });
      };
      reader.readAsText(selectedFile);
    }
  };
  
  // アップロード処理
  const handleUpload = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }
    
    setUploading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('skipFirstRow', skipFirstRow);
      formData.append('updateExisting', updateExisting);
      formData.append('skipDnc', skipDnc);
      formData.append('mappings', JSON.stringify(fieldMappings));
      
      const token = localStorage.getItem('token');
      
      // CSVデータをアップロード
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/contacts/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'アップロードに失敗しました');
      }
      
      const data = await response.json();
      
      setUploadResults(data);
      setSuccessMessage(`${data.imported_count}件の連絡先をインポートしました`);
      
      // 連絡先リストを更新
      fetchContacts();
    } catch (err) {
      console.error('アップロードエラー:', err);
      setError('連絡先のアップロードに失敗しました: ' + err.message);
    } finally {
      setUploading(false);
    }
  };
  
  // フィールドマッピングの更新
  const updateMapping = (field, columnIndex) => {
    setFieldMappings({
      ...fieldMappings,
      [field]: parseInt(columnIndex)
    });
  };
  
  // テンプレートのダウンロード処理
  const downloadTemplate = () => {
    const csvContent = "電話番号,名前,会社名,メールアドレス\n09012345678,山田太郎,サンプル株式会社,sample@example.com";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'contacts_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">連絡先アップロード</h1>
      
      {campaign && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <div className="flex">
            <Info className="h-6 w-6 text-blue-500 mr-2" />
            <div>
              <h2 className="text-lg font-semibold text-blue-800">{campaign.name}</h2>
              <p className="text-blue-700">このキャンペーンに連絡先をアップロードします。</p>
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6">
          <div className="flex">
            <Check className="h-5 w-5 mr-2" />
            <p>{successMessage}</p>
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">CSVファイルをアップロード</h2>
        
        <div className="flex justify-between items-center mb-4">
          <p className="text-gray-600">
            CSVファイル形式で連絡先リストをアップロードしてください。
          </p>
          <button
            onClick={downloadTemplate}
            className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Download className="h-4 w-4 mr-1" />
            テンプレート
          </button>
        </div>
        
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 mb-4 text-center">
          <input
            type="file"
            id="fileUpload"
            className="hidden"
            accept=".csv"
            onChange={handleFileChange}
          />
          <label
            htmlFor="fileUpload"
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            <Upload className="h-10 w-10 text-blue-500 mb-2" />
            <span className="text-gray-700 mb-1">CSVファイルをドラッグ＆ドロップまたはクリックして選択</span>
            <span className="text-gray-500 text-sm">{file ? file.name : 'CSVファイル形式（UTF-8推奨）'}</span>
          </label>
        </div>
        
        {previewData && previewData.length > 0 && (
          <div className="mt-4 mb-4">
            <h3 className="text-md font-semibold mb-2">ファイルプレビュー（最初の10行）</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {previewData[0].map((header, index) => (
                      <th key={index} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        列 {index + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 && skipFirstRow ? 'bg-gray-100' : ''}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                          {cell || <span className="text-gray-300">空</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewData.length > 0 && (
              <div className="mt-2 text-sm text-gray-500">
                {skipFirstRow && <span>※ 1行目（グレー部分）はヘッダーとしてスキップされます</span>}
              </div>
            )}
          </div>
        )}
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-md font-semibold mb-2">フィールドマッピング</h3>
            <div className="space-y-2">
              <div className="flex items-center">
                <label className="w-32 text-sm text-gray-700">電話番号:</label>
                <select
                  value={fieldMappings.phone}
                  onChange={(e) => updateMapping('phone', e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  {previewData && previewData[0] && previewData[0].map((_, index) => (
                    <option key={index} value={index}>列 {index + 1}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="w-32 text-sm text-gray-700">名前:</label>
                <select
                  value={fieldMappings.name}
                  onChange={(e) => updateMapping('name', e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value={-1}>なし</option>
                  {previewData && previewData[0] && previewData[0].map((_, index) => (
                    <option key={index} value={index}>列 {index + 1}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="w-32 text-sm text-gray-700">会社名:</label>
                <select
                  value={fieldMappings.company}
                  onChange={(e) => updateMapping('company', e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value={-1}>なし</option>
                  {previewData && previewData[0] && previewData[0].map((_, index) => (
                    <option key={index} value={index}>列 {index + 1}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="w-32 text-sm text-gray-700">メール:</label>
                <select
                  value={fieldMappings.email}
                  onChange={(e) => updateMapping('email', e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value={-1}>なし</option>
                  {previewData && previewData[0] && previewData[0].map((_, index) => (
                    <option key={index} value={index}>列 {index + 1}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-md font-semibold mb-2">アップロードオプション</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={skipFirstRow}
                  onChange={(e) => setSkipFirstRow(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">1行目をヘッダーとしてスキップ</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">既存の連絡先を更新する</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={skipDnc}
                  onChange={(e) => setSkipDnc(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">発信拒否リスト(DNC)のチェックを行う</span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate(`/campaigns/${campaignId}`)}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 ${
              !file || uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {uploading ? '処理中...' : 'アップロード'}
          </button>
        </div>
      </div>
      
      {uploadResults && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">アップロード結果</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-md font-semibold mb-2">サマリー</h3>
              <ul className="space-y-2">
                <li className="flex justify-between">
                  <span className="text-gray-600">処理された行数:</span>
                  <span className="font-medium">{uploadResults.total_count || 0}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-600">インポートされた連絡先:</span>
                  <span className="font-medium text-green-600">{uploadResults.imported_count || 0}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-600">更新された連絡先:</span>
                  <span className="font-medium text-blue-600">{uploadResults.updated_count || 0}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-600">スキップされた連絡先:</span>
                  <span className="font-medium text-yellow-600">{uploadResults.skipped_count || 0}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-600">エラー発生:</span>
                  <span className="font-medium text-red-600">{uploadResults.error_count || 0}</span>
                </li>
              </ul>
            </div>
            
            {uploadResults.errors && uploadResults.errors.length > 0 && (
              <div>
                <h3 className="text-md font-semibold mb-2">エラー</h3>
                <div className="max-h-60 overflow-y-auto border rounded p-2 bg-red-50">
                  <ul className="space-y-1">
                    {uploadResults.errors.map((error, index) => (
                      <li key={index} className="text-sm text-red-600 flex items-start">
                        <X className="h-4 w-4 mr-1 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/campaigns/${campaignId}`)}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              キャンペーンに戻る
            </button>
          </div>
        </div>
      )}
      
      {contacts.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">現在の連絡先リスト（プレビュー）</h2>
            <div className="text-sm text-gray-500">
              {contacts.length}件の連絡先が表示されています
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">電話番号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名前</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">会社名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contacts.map((contact, index) => (
                  <tr key={contact.id || index}>
                    <td className="px-4 py-3 whitespace-nowrap">{contact.phone}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{contact.name || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{contact.company || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        contact.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        contact.status === 'completed' ? 'bg-green-100 text-green-800' :
                        contact.status === 'called' ? 'bg-blue-100 text-blue-800' :
                        contact.status === 'failed' ? 'bg-red-100 text-red-800' :
                        contact.status === 'dnc' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {contact.status === 'pending' ? '待機中' :
                         contact.status === 'completed' ? '完了' :
                         contact.status === 'called' ? '発信済' :
                         contact.status === 'failed' ? '失敗' :
                         contact.status === 'dnc' ? '発信拒否' :
                         contact.status || '不明'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsUpload;