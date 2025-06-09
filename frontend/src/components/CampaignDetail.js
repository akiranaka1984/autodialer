// frontend/src/components/CampaignDetail.js - 完全修正版
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Settings, 
  Users, 
  BarChart3, 
  Mic,
  Upload,
  Download,
  Search,
  Filter,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft
} from 'lucide-react';
import IvrSettings from './IvrSettings';
import TransferSettings from './TransferSettings';

const CampaignDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef();

  // State管理
  const [campaign, setCampaign] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // 連絡先関連のstate
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [contactTotal, setContactTotal] = useState(0);
  
  // CSVアップロード関連のstate
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [showCsvFormat, setShowCsvFormat] = useState(false);
  const [csvOptions, setCsvOptions] = useState({
    hasHeader: true,
    skipEmptyLines: true,
    delimiter: 'auto'
  });

  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';

  // デバッグ用：APIエンドポイントをログ出力
  console.log('🔍 API Base URL:', apiBaseUrl);

  // タブ構成
  const tabs = [
    { id: 'overview', name: '概要', icon: BarChart3 },
    { id: 'contacts', name: '連絡先', icon: Users },
    { id: 'ivr', name: 'IVR設定', icon: Mic },
    { id: 'transfer', name: '転送設定', icon: Settings },
    { id: 'settings', name: '設定', icon: Settings }
  ];

  // ステータスオプション
  const statusOptions = [
    { value: 'all', label: 'すべて' },
    { value: 'pending', label: '未処理' },
    { value: 'called', label: '発信済み' },
    { value: 'completed', label: '完了' },
    { value: 'failed', label: '失敗' },
    { value: 'dnc', label: 'DNC' }
  ];

  // 初期データ読み込み
  useEffect(() => {
    fetchCampaignData();
  }, [id]);

  // 連絡先データ読み込み（タブが変更されたとき）
  useEffect(() => {
    if (activeTab === 'contacts') {
      fetchContacts();
    }
  }, [activeTab, searchTerm, statusFilter, currentPage]);

// 既存のuseEffect群の後に追加
useEffect(() => {
  // アクティブなキャンペーンの場合、5秒ごとに進捗を更新
  let progressInterval = null;
  
  if (campaign && campaign.status === 'active') {
    progressInterval = setInterval(async () => {
      try {
        const statsResponse = await fetch(`${apiBaseUrl}/campaigns/${id}/stats`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }
      } catch (error) {
        console.warn('進捗更新エラー:', error);
      }
    }, 5000);
  }
  
  return () => {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  };
}, [campaign?.status, id]);

  // キャンペーンデータ取得
  const fetchCampaignData = async () => {
    try {
      setLoading(true);
      setError(null);

      // キャンペーン詳細取得
      const campaignResponse = await fetch(`${apiBaseUrl}/campaigns/${id}`);
      if (!campaignResponse.ok) {
        throw new Error('キャンペーンが見つかりません');
      }
      const campaignData = await campaignResponse.json();
      setCampaign(campaignData);

      // 統計情報取得
      try {
        const statsResponse = await fetch(`${apiBaseUrl}/campaigns/${id}/stats`);
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setStats(statsData);
        }
      } catch (statsError) {
        console.warn('統計情報の取得に失敗:', statsError);
      }

    } catch (err) {
      console.error('キャンペーンデータ取得エラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 連絡先一覧取得
  const fetchContacts = async () => {
    try {
      setContactsLoading(true);
      
      const params = new URLSearchParams({
        page: currentPage,
        limit: 20
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`${apiBaseUrl}/campaigns/${id}/contacts?${params}`);
      
      if (!response.ok) {
        throw new Error('連絡先の取得に失敗しました');
      }

      const data = await response.json();
      setContacts(data.contacts || []);
      setTotalPages(data.totalPages || 1);
      setContactTotal(data.total || 0);

    } catch (err) {
      console.error('連絡先取得エラー:', err);
      setError(err.message);
    } finally {
      setContactsLoading(false);
    }
  };

  // CSVファイル選択
  const handleCsvFileSelect = () => {
    fileInputRef.current?.click();
  };

  // CSVアップロード処理
  const handleCsvUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // ファイル検証
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('CSVファイルを選択してください');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB制限
      setUploadError('ファイルサイズは10MB以下にしてください');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('hasHeader', csvOptions.hasHeader);
      formData.append('skipEmptyLines', csvOptions.skipEmptyLines);
      formData.append('delimiter', csvOptions.delimiter);

      const response = await fetch(`${apiBaseUrl}/campaigns/${id}/contacts/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || 'dummy-token'}`
        },
        body: formData
      });

      console.log('📤 CSV Upload Request:', {
        url: `${apiBaseUrl}/campaigns/${id}/contacts/upload`,
        method: 'POST',
        hasFile: !!file,
        fileName: file.name,
        fileSize: file.size
      });

      console.log('📥 CSV Upload Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'アップロードに失敗しました');
      }

      const result = await response.json();
      setUploadSuccess(`${result.imported || 0}件の連絡先を追加しました`);
      
      // データを再読み込み
      await fetchCampaignData();
      if (activeTab === 'contacts') {
        await fetchContacts();
      }

      // 成功メッセージを3秒後に消去
      setTimeout(() => setUploadSuccess(null), 3000);

    } catch (err) {
      console.error('CSVアップロードエラー:', err);
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // キャンペーン開始/停止
  const handleCampaignToggle = async () => {
  try {
    setLoading(true);
    setError(null);
    
    const action = campaign.status === 'active' ? 'stop' : 'start';
    const token = localStorage.getItem('token');
    
    console.log(`🎯 キャンペーン${action}リクエスト:`, {
      url: `${apiBaseUrl}/campaigns/${id}/${action}`,
      method: 'POST'
    });
    
    const response = await fetch(`${apiBaseUrl}/campaigns/${id}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || 'dummy-token'}`
      }
    });
    
    console.log(`📥 ${action}レスポンス:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `キャンペーンの${action === 'start' ? '開始' : '停止'}に失敗しました`);
    }
    
    const result = await response.json();
    console.log(`✅ ${action}成功:`, result);
    
    // 成功メッセージを表示
    setUploadSuccess(result.message || `キャンペーンを${action === 'start' ? '開始' : '停止'}しました`);
    
    // データを再読み込み
    await fetchCampaignData();
    
    // 成功メッセージを3秒後に消去
    setTimeout(() => setUploadSuccess(null), 3000);
    
  } catch (err) {
    console.error(`❌ キャンペーン${campaign.status === 'active' ? '停止' : '開始'}エラー:`, err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

  // ステータス表示
  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'paused': return 'text-yellow-600 bg-yellow-100';
      case 'completed': return 'text-blue-600 bg-blue-100';
      case 'draft': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return '稼働中';
      case 'paused': return '一時停止';
      case 'completed': return '完了';
      case 'draft': return '下書き';
      default: return status;
    }
  };

  // ローディング表示
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

  // エラー表示
  if (error) {
    return (
      <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 mr-2" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // データが見つからない場合
  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">キャンペーンが見つかりません</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate('/campaigns')}
            className="mr-4 p-2 hover:bg-gray-100 rounded-md"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <div className="flex items-center mt-1 space-x-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(campaign.status)}`}>
                {getStatusText(campaign.status)}
              </span>
              {campaign.caller_id_number && (
                <span className="text-sm text-gray-600">
                  発信者番号: {campaign.caller_id_number}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex space-x-3">
<button
  onClick={handleCampaignToggle}
  disabled={loading || campaign.status === 'completed'}
  className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
    campaign.status === 'active'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-green-600 hover:bg-green-700 text-white'
  } disabled:opacity-50 disabled:cursor-not-allowed`}
>
  {loading ? (
    <>
      <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-opacity-30 border-t-white rounded-full"></div>
      {campaign.status === 'active' ? '停止中...' : '開始中...'}
    </>
  ) : campaign.status === 'active' ? (
    <>
      <Pause className="h-4 w-4 mr-2" />
      停止
    </>
  ) : (
    <>
      <Play className="h-4 w-4 mr-2" />
      開始
    </>
  )}
</button>          
          <button
            onClick={() => navigate(`/campaigns/${id}/edit`)}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Settings className="h-4 w-4 mr-2" />
            編集
          </button>
        </div>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">連絡先</p>
                <p className="text-2xl font-bold">{stats.contacts?.total || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-green-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">進捗</p>
                <p className="text-2xl font-bold">{stats.progress || 0}%</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">完了</p>
                <p className="text-2xl font-bold">{stats.contacts?.completed || 0}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">失敗</p>
                <p className="text-2xl font-bold">{stats.contacts?.failed || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タブナビゲーション */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* タブコンテンツ */}
        <div className="p-6">
          {/* 概要タブ */}
          {activeTab === 'overview' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">キャンペーン概要</h2>
              {campaign.description && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-1">説明</h3>
                  <p className="text-gray-600">{campaign.description}</p>
                </div>
              )}
              
              {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">連絡先統計</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">未処理:</span>
                        <span className="text-sm font-medium">{stats.contacts?.pending || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">発信済み:</span>
                        <span className="text-sm font-medium">{stats.contacts?.called || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">完了:</span>
                        <span className="text-sm font-medium">{stats.contacts?.completed || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">DNC:</span>
                        <span className="text-sm font-medium">{stats.contacts?.dnc || 0}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">通話統計</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">総通話数:</span>
                        <span className="text-sm font-medium">{stats.calls?.total || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">応答:</span>
                        <span className="text-sm font-medium">{stats.calls?.answered || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">無応答:</span>
                        <span className="text-sm font-medium">{stats.calls?.noAnswer || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">話中:</span>
                        <span className="text-sm font-medium">{stats.calls?.busy || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">平均通話時間:</span>
                        <span className="text-sm font-medium">{stats.calls?.avgDuration || 0}秒</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 連絡先タブ */}
          {activeTab === 'contacts' && (
            <div>
              {/* ヘッダー部分 */}
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">連絡先一覧</h2>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCsvFileSelect}
                    disabled={isUploading}
                    className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUploading ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-opacity-30 border-t-white rounded-full"></div>
                        アップロード中...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        CSVアップロード
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* アップロードメッセージ */}
              {uploadSuccess && (
                <div className="mb-4 bg-green-100 border-l-4 border-green-500 text-green-700 p-3 rounded">
                  <div className="flex">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    <span className="text-sm">{uploadSuccess}</span>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    <span className="text-sm">{uploadError}</span>
                  </div>
                </div>
              )}

              {/* 検索・フィルター */}
              <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 md:space-x-4">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="電話番号、名前、会社名で検索"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    <Filter className="h-4 w-4 text-gray-400 mr-2" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* CSVフォーマット例（折りたたみ） */}
              <div className="mb-4">
                <button
                  onClick={() => setShowCsvFormat(!showCsvFormat)}
                  className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  {showCsvFormat ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                  CSVフォーマット例を{showCsvFormat ? '隠す' : '表示'}
                </button>
                
                {showCsvFormat && (
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-md p-4">
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">アップロード設定</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={csvOptions.hasHeader}
                            onChange={(e) => setCsvOptions({...csvOptions, hasHeader: e.target.checked})}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-600">1行目をヘッダーとして使用</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={csvOptions.skipEmptyLines}
                            onChange={(e) => setCsvOptions({...csvOptions, skipEmptyLines: e.target.checked})}
                            className="mr-2"
                          />
                          <span className="text-sm text-gray-600">空行をスキップ</span>
                        </label>
                        <div>
                          <label className="text-sm text-gray-600 block mb-1">区切り文字</label>
                          <select
                            value={csvOptions.delimiter}
                            onChange={(e) => setCsvOptions({...csvOptions, delimiter: e.target.value})}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="auto">自動検出</option>
                            <option value=",">,（カンマ）</option>
                            <option value=";">;（セミコロン）</option>
                            <option value="\t">タブ</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-sm">
                      <h4 className="font-medium text-gray-700 mb-2">CSVフォーマット例:</h4>
                      <div className="bg-white border border-gray-300 rounded p-2 font-mono text-xs">
                        <div className="text-gray-600">phone,name,company</div>
                        <div>09012345678,田中太郎,株式会社サンプル</div>
                        <div>08012345679,佐藤花子,サンプル商事</div>
                        <div>07012345680,鈴木次郎,</div>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        ※ phone（電話番号）は必須です。name（名前）、company（会社名）は任意です。
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 連絡先テーブル */}
              {contactsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">読み込み中...</p>
                </div>
              ) : contacts.length > 0 ? (
                <div>
                  <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              電話番号
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              名前
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              会社名
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ステータス
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              最終試行
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {contacts.map((contact) => (
                            <tr key={contact.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {contact.phone}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contact.name || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contact.company || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  contact.status === 'completed' ? 'bg-green-100 text-green-800' :
                                  contact.status === 'failed' ? 'bg-red-100 text-red-800' :
                                  contact.status === 'called' ? 'bg-blue-100 text-blue-800' :
                                  contact.status === 'dnc' ? 'bg-gray-100 text-gray-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {contact.status === 'pending' ? '未処理' :
                                   contact.status === 'called' ? '発信済み' :
                                   contact.status === 'completed' ? '完了' :
                                   contact.status === 'failed' ? '失敗' :
                                   contact.status === 'dnc' ? 'DNC' : contact.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contact.last_attempt ? new Date(contact.last_attempt).toLocaleString('ja-JP') : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ページネーション */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        {contactTotal}件中 {(currentPage - 1) * 20 + 1}〜{Math.min(currentPage * 20, contactTotal)}件を表示
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          前へ
                        </button>
                        <span className="px-3 py-2 text-sm">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          次へ
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">連絡先がありません</h3>
                  <p className="text-gray-500 mb-4">
                    CSVファイルをアップロードして連絡先を追加してください。
                  </p>
                  <button
                    onClick={handleCsvFileSelect}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    CSVアップロード
                  </button>
                </div>
              )}
            </div>
          )}

          {/* IVR設定タブ */}
          {activeTab === 'ivr' && (
            <IvrSettings campaignId={id} />
          )}
	  {activeTab === 'transfer' && (
  	    <TransferSettings campaignId={id} />
	  )}

          {/* 設定タブ */}
          {activeTab === 'settings' && (
            <div>
              <h2 className="text-lg font-semibold mb-4">キャンペーン設定</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">基本情報</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500">キャンペーン名</label>
                      <p className="text-sm text-gray-900">{campaign.name}</p>
                    </div>
                    {campaign.description && (
                      <div>
                        <label className="text-xs font-medium text-gray-500">説明</label>
                        <p className="text-sm text-gray-900">{campaign.description}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-gray-500">ステータス</label>
                      <p className="text-sm text-gray-900">{getStatusText(campaign.status)}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">作成日時</label>
                      <p className="text-sm text-gray-900">
                        {new Date(campaign.created_at).toLocaleString('ja-JP')}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">発信設定</h3>
                  <div className="space-y-3">
                    {campaign.caller_id_number && (
                      <div>
                        <label className="text-xs font-medium text-gray-500">発信者番号</label>
                        <p className="text-sm text-gray-900">{campaign.caller_id_number}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-gray-500">最大同時通話数</label>
                      <p className="text-sm text-gray-900">{campaign.max_concurrent_calls || '5'}</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">リトライ回数</label>
                      <p className="text-sm text-gray-900">{campaign.retry_attempts || '0'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignDetail;
