import React, { useState, useEffect } from 'react';
import { Phone, Calendar, Clock, Search, Filter } from 'lucide-react';

const OperatorHistory = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  });

  useEffect(() => {
    fetchOperatorCalls();
  }, [filters, pagination.page]);

  const fetchOperatorCalls = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // 開発環境のモックデータ
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => {
          setCalls([
            {
              id: 1,
              start_time: '2025-05-05T10:30:00Z',
              end_time: '2025-05-05T10:35:12Z',
              duration: 312,
              customer_phone: '09012345678',
              customer_name: '山田太郎',
              campaign_name: 'サマーセール案内',
              disposition: 'completed',
              customer_satisfaction: 5,
              notes: '商品について詳しい説明を求められました。'
            },
            {
              id: 2,
              start_time: '2025-05-05T11:15:00Z',
              end_time: '2025-05-05T11:18:45Z',
              duration: 225,
              customer_phone: '09023456789',
              customer_name: '佐藤花子',
              campaign_name: '顧客満足度調査',
              disposition: 'completed',
              customer_satisfaction: 4,
              notes: '全体的に満足しているが、配送について改善要望あり。'
            }
          ]);
          setPagination(prev => ({ ...prev, total: 50 }));
          setLoading(false);
        }, 500);
        return;
      }
      
      // 実際のAPI呼び出し
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      
      const response = await fetch(`/api/operators/calls/history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('通話履歴の取得に失敗しました');
      
      const data = await response.json();
      setCalls(data.calls);
      setPagination(prev => ({ ...prev, total: data.total }));
    } catch (error) {
      console.error('通話履歴取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getDispositionBadge = (disposition) => {
    const styles = {
      completed: 'bg-green-100 text-green-800',
      transferred: 'bg-blue-100 text-blue-800',
      dropped: 'bg-red-100 text-red-800',
      voicemail: 'bg-yellow-100 text-yellow-800'
    };
    
    const labels = {
      completed: '完了',
      transferred: '転送',
      dropped: '切断',
      voicemail: 'ボイスメール'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[disposition]}`}>
        {labels[disposition] || disposition}
      </span>
    );
  };

  const renderSatisfactionStars = (rating) => {
    return (
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`text-lg ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
          >
            ★
          </span>
        ))}
      </div>
    );
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
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">通話履歴</h1>

      {/* フィルター */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                placeholder="顧客名、電話番号で検索"
                className="w-full border rounded-md shadow-sm p-2 pl-10"
              />
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 通話一覧 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                日時
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                顧客情報
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                キャンペーン
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                通話時間
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                結果
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                満足度
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {calls.map((call) => (
              <tr key={call.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div>{new Date(call.start_time).toLocaleString('ja-JP')}</div>
                  <div className="text-xs text-gray-400">
                    終了: {new Date(call.end_time).toLocaleString('ja-JP')}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{call.customer_name}</div>
                  <div className="text-sm text-gray-500">{call.customer_phone}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {call.campaign_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDuration(call.duration)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getDispositionBadge(call.disposition)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {call.customer_satisfaction && renderSatisfactionStars(call.customer_satisfaction)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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

export default OperatorHistory;