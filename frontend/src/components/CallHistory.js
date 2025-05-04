import React, { useState, useEffect } from 'react';
import { Phone, Calendar, Search, Filter, Download } from 'lucide-react';

const CallHistory = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    campaign: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    search: ''
  });
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  });

  useEffect(() => {
    fetchCampaigns();
    fetchCalls();
  }, [filters, pagination.page]);

  const fetchCampaigns = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/campaigns', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data);
      }
    } catch (error) {
      console.error('キャンペーン取得エラー:', error);
    }
  };

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // クエリパラメータの構築
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      
      const response = await fetch(`/api/calls?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCalls(data.calls);
        setPagination(prev => ({ ...prev, total: data.total }));
      }
    } catch (error) {
      console.error('通話履歴取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams(filters);
      
      const response = await fetch(`/api/calls/export?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `call_history_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (error) {
      console.error('エクスポートエラー:', error);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'ANSWERED': 'bg-green-100 text-green-800',
      'NO ANSWER': 'bg-red-100 text-red-800',
      'BUSY': 'bg-yellow-100 text-yellow-800',
      'FAILED': 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">通話履歴</h1>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Download className="h-5 w-5 mr-1 inline" />
          エクスポート
        </button>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">キャンペーン</label>
            <select
              name="campaign"
              value={filters.campaign}
              onChange={handleFilterChange}
              className="w-full border rounded-md shadow-sm p-2"
            >
              <option value="">すべて</option>
              {campaigns.map(campaign => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="w-full border rounded-md shadow-sm p-2"
            >
              <option value="">すべて</option>
              <option value="ANSWERED">応答</option>
              <option value="NO ANSWER">不応答</option>
              <option value="BUSY">話中</option>
              <option value="FAILED">失敗</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
            <input
              type="date"
              name="dateFrom"
              value={filters.dateFrom}
              onChange={handleFilterChange}
              className="w-full border rounded-md shadow-sm p-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">終了日</label>
            <input
              type="date"
              name="dateTo"
              value={filters.dateTo}
              onChange={handleFilterChange}
              className="w-full border rounded-md shadow-sm p-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">検索</label>
            <div className="relative">
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder="電話番号、名前で検索"
                className="w-full border rounded-md shadow-sm p-2 pl-10"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 通話一覧 */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="text-center py-8">読み込み中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日時</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キャンペーン</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">電話番号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名前</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">通話時間</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">キー入力</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {calls.map(call => (
                  <tr key={call.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(call.start_time).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {call.campaign_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {call.contact_phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {call.contact_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(call.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {call.duration ? `${call.duration}秒` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {call.keypress || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* ページネーション */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              前へ
              </button>
           <button
             onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
             disabled={pagination.page * pagination.limit >= pagination.total}
             className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
           >
             次へ
           </button>
         </div>
         <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
           <div>
             <p className="text-sm text-gray-700">
               全{' '}
               <span className="font-medium">{pagination.total}</span>
               {' '}件中{' '}
               <span className="font-medium">
                 {(pagination.page - 1) * pagination.limit + 1}
               </span>
               {' '}-{' '}
               <span className="font-medium">
                 {Math.min(pagination.page * pagination.limit, pagination.total)}
               </span>
               {' '}件を表示
             </p>
           </div>
           <div>
             <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
               <button
                 onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                 disabled={pagination.page === 1}
                 className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
               >
                 前へ
               </button>
               
               {/* ページ番号ボタン */}
               {[...Array(Math.min(5, Math.ceil(pagination.total / pagination.limit)))].map((_, index) => {
                 const pageNumber = index + 1;
                 return (
                   <button
                     key={pageNumber}
                     onClick={() => setPagination(prev => ({ ...prev, page: pageNumber }))}
                     className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                       pagination.page === pageNumber
                         ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                         : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                     }`}
                   >
                     {pageNumber}
                   </button>
                 );
               })}
               
               <button
                 onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                 disabled={pagination.page * pagination.limit >= pagination.total}
                 className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
               >
                 次へ
               </button>
             </nav>
           </div>
         </div>
       </div>
     </div>
   </div>
 );
};

export default CallHistory;