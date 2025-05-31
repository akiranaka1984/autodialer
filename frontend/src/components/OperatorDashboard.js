// frontend/src/components/OperatorDashboard.js
import React, { useState, useEffect } from 'react';
import { 
  Users, Phone, Clock, BarChart2, Plus, Edit, Trash2, 
  UserPlus, Calendar, CheckCircle, XCircle, Coffee, X
} from 'lucide-react';

const OperatorDashboard = () => {
  const [operators, setOperators] = useState([]);
  const [stats, setStats] = useState({
    totalOperators: 0,
    availableOperators: 0,
    busyOperators: 0,
    avgSatisfaction: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    skills: []
  });
  const [availableSkills] = useState([
    '営業',
    'テクニカルサポート',
    'カスタマーサポート',
    '請求関連',
    '苦情対応',
    '一般問い合わせ'
  ]);

  useEffect(() => {
    fetchOperators();
    fetchStats();
  }, []);

  const fetchOperators = async () => {
    try {
      setLoading(true);
      
      // 開発環境のモックデータ
      if (process.env.NODE_ENV === 'development') {
        setTimeout(() => {
          setOperators([
            {
              id: 1,
              operator_id: 'OP001',
              user_name: '山田太郎',
              user_email: 'yamada@example.com',
              status: 'available',
              current_call_id: null,
              skills: ['営業', 'テクニカルサポート'],
              total_calls_handled: 150,
              avg_satisfaction: 4.5
            },
            {
              id: 2,
              operator_id: 'OP002',
              user_name: '鈴木花子',
              user_email: 'suzuki@example.com',
              status: 'busy',
              current_call_id: 'CALL-123',
              skills: ['カスタマーサポート', '請求関連'],
              total_calls_handled: 230,
              avg_satisfaction: 4.8
            },
            {
              id: 3,
              operator_id: 'OP003',
              user_name: '佐藤次郎',
              user_email: 'sato@example.com',
              status: 'break',
              current_call_id: null,
              skills: ['テクニカルサポート'],
              total_calls_handled: 87,
              avg_satisfaction: 4.2
            }
          ]);
          setLoading(false);
        }, 500);
        return;
      }
      
      // 実際のAPI呼び出し
      const token = localStorage.getItem('token');
      const response = await fetch('/api/operators', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('オペレーター一覧の取得に失敗しました');
      
      const data = await response.json();
      setOperators(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // 開発環境のモックデータ
      if (process.env.NODE_ENV === 'development') {
        setStats({
          totalOperators: 8,
          availableOperators: 3,
          busyOperators: 4,
          avgSatisfaction: 4.5
        });
        return;
      }
      
      // 実際のAPI呼び出し
      const token = localStorage.getItem('token');
      const response = await fetch('/api/operators/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('統計情報の取得に失敗しました');
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('統計情報取得エラー:', error);
    }
  };

  const handleStatusChange = async (operatorId, newStatus) => {
    try {
      // 開発環境のモック処理
      if (process.env.NODE_ENV === 'development') {
        setOperators(operators.map(op => 
          op.id === operatorId ? { ...op, status: newStatus } : op
        ));
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/operators/${operatorId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!response.ok) throw new Error('ステータス更新に失敗しました');
      
      fetchOperators();
    } catch (error) {
      setError(error.message);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSkillToggle = (skill) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // 開発環境のモック処理
      if (process.env.NODE_ENV === 'development') {
        const newOperator = {
          id: operators.length + 1,
          operator_id: `OP${String(operators.length + 1).padStart(3, '0')}`,
          user_name: formData.name,
          user_email: formData.email,
          status: 'offline',
          current_call_id: null,
          skills: formData.skills,
          total_calls_handled: 0,
          avg_satisfaction: 0
        };
        
        setOperators([...operators, newOperator]);
        setShowAddForm(false);
        setFormData({
          username: '',
          name: '',
          email: '',
          password: '',
          skills: []
        });
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/operators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          role: 'operator'
        })
      });
      
      if (!response.ok) throw new Error('オペレーターの作成に失敗しました');
      
      fetchOperators();
      setShowAddForm(false);
      setFormData({
        username: '',
        name: '',
        email: '',
        password: '',
        skills: []
      });
    } catch (error) {
      setError(error.message);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      available: 'bg-green-100 text-green-800',
      busy: 'bg-red-100 text-red-800',
      offline: 'bg-gray-100 text-gray-800',
      break: 'bg-yellow-100 text-yellow-800'
    };
    
    const labels = {
      available: '対応可能',
      busy: '対応中',
      offline: 'オフライン',
      break: '休憩中'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
        {labels[status] || status}
      </span>
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">オペレーター管理</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
        >
          <UserPlus className="h-5 w-5 mr-1" />
          新規オペレーター
        </button>
      </div>

      {/* 新規オペレーター登録フォーム */}
      {showAddForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">新規オペレーター登録</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ユーザー名
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleFormChange}
                  required
                  className="w-full border rounded-md shadow-sm p-2"
                  placeholder="例: operator01"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  氏名
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  required
                  className="w-full border rounded-md shadow-sm p-2"
                  placeholder="例: 山田太郎"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メールアドレス
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  required
                  className="w-full border rounded-md shadow-sm p-2"
                  placeholder="例: yamada@example.com"
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  パスワード
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleFormChange}
                  required
                  className="w-full border rounded-md shadow-sm p-2"
                  placeholder="パスワードを入力"
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  スキル
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availableSkills.map(skill => (
                    <label key={skill} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.skills.includes(skill)}
                        onChange={() => handleSkillToggle(skill)}
                        className="mr-2"
                      />
                      <span className="text-sm">{skill}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  登録
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ステータスカード */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 text-blue-500 mr-4">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">総オペレーター数</p>
              <p className="text-xl font-semibold">{stats.totalOperators}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 text-green-500 mr-4">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">対応可能</p>
              <p className="text-xl font-semibold">{stats.availableOperators}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-red-100 text-red-500 mr-4">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">対応中</p>
              <p className="text-xl font-semibold">{stats.busyOperators}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 text-purple-500 mr-4">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500">平均満足度</p>
              <p className="text-xl font-semibold">{stats.avgSatisfaction}/5</p>
            </div>
          </div>
        </div>
      </div>

      {/* オペレーター一覧 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                オペレーターID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名前
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ステータス
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                スキル
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                対応件数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                満足度
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {operators.map((operator) => (
              <tr key={operator.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {operator.operator_id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{operator.user_name}</div>
                  <div className="text-sm text-gray-500">{operator.user_email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(operator.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {operator.skills.join(', ')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {operator.total_calls_handled}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {operator.avg_satisfaction}/5
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <select
                    value={operator.status}
                    onChange={(e) => handleStatusChange(operator.id, e.target.value)}
                    className="mr-2 border rounded px-2 py-1"
                  >
                    <option value="available">対応可能</option>
                    <option value="busy">対応中</option>
                    <option value="break">休憩中</option>
                    <option value="offline">オフライン</option>
                  </select>
                  <button className="text-blue-600 hover:text-blue-900 mr-2">
                    <Edit className="h-5 w-5" />
                  </button>
                  <button className="text-red-600 hover:text-red-900">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OperatorDashboard;