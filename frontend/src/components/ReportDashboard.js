import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Calendar, Download, Filter } from 'lucide-react';

const ReportDashboard = () => {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `/api/reports/dashboard?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const data = await response.json();
      setReportData(data);
    } catch (error) {
      console.error('レポートデータ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  if (loading) return <div className="p-4">読み込み中...</div>;

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
          <button className="btn btn-primary">
            <Download className="h-5 w-5 mr-1" />
            エクスポート
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* 日別発信数グラフ */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">日別発信数</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reportData?.dailyStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name="総発信数" fill="#8884d8" />
              <Bar dataKey="answered" name="応答数" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 時間帯別応答率 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">時間帯別応答率</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={reportData?.hourlyStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="answerRate" name="応答率(%)" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ステータス分布 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">通話ステータス分布</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={reportData?.statusDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {reportData?.statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* キャンペーン別パフォーマンス */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">キャンペーン別パフォーマンス</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">キャンペーン</th>
                  <th className="px-4 py-2 text-right">発信数</th>
                  <th className="px-4 py-2 text-right">応答率</th>
                  <th className="px-4 py-2 text-right">平均通話時間</th>
                </tr>
              </thead>
              <tbody>
                {reportData?.campaignStats.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className="px-4 py-2">{campaign.name}</td>
                    <td className="px-4 py-2 text-right">{campaign.totalCalls}</td>
                    <td className="px-4 py-2 text-right">{campaign.answerRate}%</td>
                    <td className="px-4 py-2 text-right">{campaign.avgDuration}秒</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportDashboard;