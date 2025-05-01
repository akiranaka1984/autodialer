import React, { useState, useEffect } from 'react';
import { Phone, Edit, Trash2, Check, X } from 'lucide-react';

const CallerIDManagement = () => {
  const [callerIds, setCallerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    id: null,
    number: '',
    description: '',
    provider: '',
    sip_host: '',
    auth_username: '',
    auth_password: '',
    active: true
  });
  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // 発信者番号一覧を取得
  useEffect(() => {
    fetchCallerIds();
  }, []);

  const fetchCallerIds = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/caller-ids', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('データの取得に失敗しました');
      }
      
      const data = await response.json();
      setCallerIds(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // フォームの入力変更ハンドラ
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // 新規作成フォームのリセット
  const resetForm = () => {
    setFormData({
      id: null,
      number: '',
      description: '',
      provider: '',
      sip_host: '',
      auth_username: '',
      auth_password: '',
      active: true
    });
    setIsEditing(false);
    setSubmitError(null);
  };

  // 編集モードの開始
  const handleEdit = (callerId) => {
    const callerIdToEdit = callerIds.find(c => c.id === callerId);
    setFormData({
      ...callerIdToEdit,
      auth_password: '' // パスワードは表示しない
    });
    setIsEditing(true);
    setSubmitError(null);
  };

  // 発信者番号の保存（新規作成/更新）
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      const isUpdate = formData.id !== null;
      
      const url = isUpdate 
        ? `/api/caller-ids/${formData.id}`
        : '/api/caller-ids';
      
      const method = isUpdate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '保存に失敗しました');
      }
      
      const savedCallerId = await response.json();
      
      if (isUpdate) {
        setCallerIds(callerIds.map(c => c.id === savedCallerId.id ? savedCallerId : c));
        setSuccessMessage('発信者番号を更新しました');
      } else {
        setCallerIds([...callerIds, savedCallerId]);
        setSuccessMessage('新しい発信者番号を登録しました');
      }
      
      resetForm();
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  // 発信者番号の削除
  const handleDelete = async (id) => {
    if (!window.confirm('この発信者番号を削除してもよろしいですか？キャンペーンで使用されている場合は削除できません。')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/caller-ids/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '削除に失敗しました');
      }
      
      setCallerIds(callerIds.filter(c => c.id !== id));
      setSuccessMessage('発信者番号を削除しました');
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  // 発信者番号の有効/無効切り替え
  const handleToggleStatus = async (id) => {
    const callerId = callerIds.find(c => c.id === id);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/caller-ids/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...callerId,
          active: !callerId.active
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '更新に失敗しました');
      }
      
      const updatedCallerId = await response.json();
      setCallerIds(callerIds.map(c => c.id === id ? updatedCallerId : c));
      setSuccessMessage(`発信者番号を${updatedCallerId.active ? '有効' : '無効'}にしました`);
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  if (loading) {
    return <div className="text-center p-4">読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-600 p-4">エラー: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">発信者番号管理</h1>
      
      {/* エラーと成功メッセージ */}
      {submitError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {submitError}
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {successMessage}
        </div>
      )}
      
      {/* 発信者番号リスト */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">登録済み発信者番号</h2>
        {callerIds.length === 0 ? (
          <p className="text-gray-500">登録されている発信者番号はありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border rounded">
              <thead>
                <tr>
                  <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">番号</th>
                  <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">説明</th>
                  <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">プロバイダ</th>
                  <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状態</th>
                  <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {callerIds.map((callerId) => (
                  <tr key={callerId.id}>
                    <td className="px-6 py-4 whitespace-nowrap border-b">
                      <div className="flex items-center">
                        <Phone size={16} className="mr-2 text-blue-500" />
                        {callerId.number}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b">{callerId.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap border-b">{callerId.provider}</td>
                    <td className="px-6 py-4 whitespace-nowrap border-b">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        callerId.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {callerId.active ? '有効' : '無効'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b text-sm font-medium">
                      <button 
                        onClick={() => handleEdit(callerId.id)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(callerId.id)}
                        className={`hover:text-gray-900 mr-3 ${
                          callerId.active ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {callerId.active ? <X size={16} /> : <Check size={16} />}
                      </button>
                      <button 
                        onClick={() => handleDelete(callerId.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* 発信者番号フォーム */}
      <div className="bg-gray-50 rounded p-4">
        <h2 className="text-xl font-semibold mb-4">
          {isEditing ? '発信者番号を編集' : '新しい発信者番号を追加'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="number">
              電話番号 *
            </label>
            <input
              id="number"
              name="number"
              type="text"
              placeholder="例: 0312345678（ハイフンなし）"
              value={formData.number}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
              説明
            </label>
            <input
              id="description"
              name="description"
              type="text"
              placeholder="例: 東京オフィス"
              value={formData.description}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="provider">
              プロバイダ
            </label>
            <input
              id="provider"
              name="provider"
              type="text"
              placeholder="例: Twilio"
              value={formData.provider}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="sip_host">
              SIPホスト
            </label>
            <input
              id="sip_host"
              name="sip_host"
              type="text"
              placeholder="例: sip.twilio.com"
              value={formData.sip_host}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="auth_username">
              認証ユーザー名
            </label>
            <input
              id="auth_username"
              name="auth_username"
              type="text"
              placeholder="SIPアカウント名"
              value={formData.auth_username}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="auth_password">
              認証パスワード{isEditing && ' (変更する場合のみ入力)'}
            </label>
            <input
              id="auth_password"
              name="auth_password"
              type="password"
              placeholder="SIPパスワード"
              value={formData.auth_password}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              {...(isEditing ? {} : { required: true })}
            />
          </div>
          
          <div className="mb-6">
            <label className="flex items-center">
              <input
                name="active"
                type="checkbox"
                checked={formData.active}
                onChange={handleInputChange}
                className="mr-2"
              />
              <span className="text-gray-700 text-sm font-bold">有効</span>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              {isEditing ? '更新' : '追加'}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                キャンセル
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CallerIDManagement;