import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Calendar, Download, Filter, AlertCircle } from 'lucide-react';

const ReportDashboard = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      // 開発環境用のモックデータ
      if (process.env.NODE_ENV === 'development') {
        // モックデータのセット
        setTimeout(() => {
          setReportData({
            dailyStats: [
              { date: '2025-05-01', total: 100, answered: 85 },
              { date: '2025-05-02', total: 120, answered: 95 },
              { date: '2025-05-03', total: 110, answered: 90 },
              { date: '2025-05-04', total: 130, answered: 105 },
              { date: '2025-05-05', total: 95, answered: 80 },
            ],
            hourlyStats: [
              { hour: '9:00', answerRate: 75 },
              { hour: '10:00', answerRate: 82 },
              { hour: '11:00', answerRate: 88 },
              { hour: '12:00', answerRate: 65 },
              { hour: '13:00', answerRate: 70 },
              { hour: '14:00', answerRate: 85 },
              { hour: '15:00', answerRate: 90 },
              { hour: '16:00', answerRate: 87 },
              { hour: '17:00', answerRate: 80 },
              { hour: '18:00', answerRate: 75 },
            ],
            statusDistribution: [
              { name: '応答', value: 65 },
              { name: '不応答', value: 20 },
              { name: '話中', value: 10 },
              { name: '失敗', value: 5 },
            ],
            campaignStats: [
              { id: 1, name: 'サマーセール案内', totalCalls: 250, answerRate: 82, avgDuration: 45 },
              { id: 2, name: '新規顧客フォローアップ', totalCalls: 180, answerRate: 78, avgDuration: 38 },
              { id: 3, name: '顧客満足度調査', totalCalls: 150, answerRate: 71, avgDuration: 52 },
            ]
          });
          setLoading(false);
        }, 800);
        return;
      }
      
      const response = await fetch(
        `/api/reports/dashboard?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (!response.ok) {
        throw new Error('レポートデータの取得に失敗しました');
      }
      
      const data = await response.json();
      setReportData(data);
    } catch (error) {
      console.error('レポートデータ取得エラー:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

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

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // データが存在しない場合の処理
  if (!reportData) {
    return (
      <div className="p-4">
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4">
          <p>レポートデータがありません。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">レポートダッシュボード</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="border rounded px-2 py-1"
            />
            <span>〜</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="border rounded px-2 py-1"
            />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            <Download className="h-5 w-5 mr-1 inline" />
            エクスポート
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* 日別発信数グラフ */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">日別発信数</h2>
          {reportData?.dailyStats && reportData.dailyStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reportData.dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="総発信数" fill="#8884d8" />
                <Bar dataKey="answered" name="応答数" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              データがありません
            </div>
          )}
        </div>

        {/* 時間帯別応答率 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">時間帯別応答率</h2>
          {reportData?.hourlyStats && reportData.hourlyStats.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={reportData.hourlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="answerRate" name="応答率(%)" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              データがありません
            </div>
          )}
        </div>

        {/* ステータス分布 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">通話ステータス分布</h2>
          {reportData?.statusDistribution && reportData.statusDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={reportData.statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {reportData.statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              データがありません
            </div>
          )}
        </div>

        {/* キャンペーン別パフォーマンス */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">キャンペーン別パフォーマンス</h2>
          {reportData?.campaignStats && reportData.campaignStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-left">キャンペーン</th>
                    <th className="px-4 py-2 text-right">発信数</th>
                    <th className="px-4 py-2 text-right">応答率</th>
                    <th className="px-4 py-2 text-right">平均通話時間</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.campaignStats.map((campaign) => (
                    <tr key={campaign.id} className="border-b">
                      <td className="px-4 py-2">{campaign.name}</td>
                      <td className="px-4 py-2 text-right">{campaign.totalCalls}</td>
                      <td className="px-4 py-2 text-right">{campaign.answerRate}%</td>
                      <td className="px-4 py-2 text-right">{campaign.avgDuration}秒</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-[150px] flex items-center justify-center text-gray-500">
              データがありません
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportDashboard;