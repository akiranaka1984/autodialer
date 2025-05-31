// frontend/src/components/CampaignForm.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Clock, Calendar, Phone } from 'lucide-react';

const CampaignForm = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  
  // 不足している変数を状態(state)として定義
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // campaignIdの有無に基づいて編集モードかどうかを判定
  const isEditMode = !!campaignId;

  // フォームの状態
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    caller_id_id: '',
    script: '',
    retry_attempts: 1,
    max_concurrent_calls: 5,
    schedule_start: '',
    schedule_end: '',
    working_hours_start: '09:00',
    working_hours_end: '17:00'
  });
  
  // エラー状態
  const [error, setError] = useState(null);
  
  // カラーID一覧
  const [callerIds, setCallerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // APIのベースURL
  const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
  
  // ページ読み込み時の処理
  useEffect(() => {
    // 発信者番号一覧を取得
    fetchCallerIds();
    
    // 編集モードの場合、キャンペーン情報を取得
    if (isEditMode) {
      fetchCampaignData();
    } else {
      setLoading(false);
    }
  }, [campaignId]);
  
  // 発信者番号一覧の取得
  const fetchCallerIds = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${apiBaseUrl}/caller-ids`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`発信者番号の取得に失敗しました (${response.status})`);
      }
      
      const data = await response.json();
      
      // 有効な発信者番号のみをフィルタリング
      const activeCallerIds = Array.isArray(data) 
        ? data.filter(callerId => callerId.active !== false)
        : [];
      
      setCallerIds(activeCallerIds);
    } catch (error) {
      console.error('発信者番号取得エラー:', error);
      setError('発信者番号の取得に失敗しました');
    }
  };
  
  // キャンペーン情報の取得（編集モード）
  const fetchCampaignData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`キャンペーン情報の取得に失敗しました (${response.status})`);
      }
      
      const campaignData = await response.json();
      
      // 日付フォーマットの調整
      const formattedData = {
        ...campaignData,
        schedule_start: campaignData.schedule_start ? campaignData.schedule_start.substring(0, 10) : '',
        schedule_end: campaignData.schedule_end ? campaignData.schedule_end.substring(0, 10) : ''
      };
      
      setFormData(formattedData);
    } catch (error) {
      console.error('キャンペーン情報取得エラー:', error);
      setError('キャンペーン情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };
  
  // 入力変更ハンドラ
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  // フォーム送信ハンドラ
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      
      // APIのURLとHTTPメソッドを設定
      const url = isEditMode
        ? `${apiBaseUrl}/campaigns/${campaignId}`
        : `${apiBaseUrl}/campaigns`;
      
      const method = isEditMode ? 'PUT' : 'POST';
      
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
        throw new Error(errorData.message || `キャンペーンの${isEditMode ? '更新' : '作成'}に失敗しました`);
      }
      
      const savedCampaign = await response.json();
      
      setSuccess(true);
      
      // 成功したら一覧画面に戻る（1秒後）
      setTimeout(() => {
        navigate(`/campaigns${isEditMode ? `/${campaignId}` : ''}`);
      }, 1000);
    } catch (error) {
      console.error('キャンペーン保存エラー:', error);
      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return <div className="text-center p-8">読み込み中...</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">{isEditMode ? 'キャンペーン編集' : '新しいキャンペーン'}</h1>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6">
          <div className="flex">
            <Check className="h-5 w-5 mr-2" />
            <p>キャンペーンが{isEditMode ? '更新' : '作成'}されました</p>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
              キャンペーン名 *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="caller_id_id">
              発信者番号 *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <select
                id="caller_id_id"
                name="caller_id_id"
                value={formData.caller_id_id}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">発信者番号を選択</option>
                {callerIds.map(callerId => (
                  <option key={callerId.id} value={callerId.id}>
                    {callerId.number} - {callerId.description || '説明なし'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
            説明
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description || ''}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3"
          ></textarea>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="script">
            スクリプト
          </label>
          <textarea
            id="script"
            name="script"
            value={formData.script || ''}
            onChange={handleChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="5"
          ></textarea>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="schedule_start">
              スケジュール開始日
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                id="schedule_start"
                name="schedule_start"
                value={formData.schedule_start || ''}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="schedule_end">
              スケジュール終了日
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                id="schedule_end"
                name="schedule_end"
                value={formData.schedule_end || ''}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="working_hours_start">
              営業時間開始
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Clock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="time"
                id="working_hours_start"
                name="working_hours_start"
                value={formData.working_hours_start || '09:00'}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="working_hours_end">
              営業時間終了
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Clock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="time"
                id="working_hours_end"
                name="working_hours_end"
                value={formData.working_hours_end || '17:00'}
                onChange={handleChange}
                className="shadow appearance-none border rounded w-full py-2 pl-10 pr-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="retry_attempts">
              リトライ回数
            </label>
            <input
              type="number"
              id="retry_attempts"
              name="retry_attempts"
              value={formData.retry_attempts || 1}
              onChange={handleChange}
              min="0"
              max="5"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="max_concurrent_calls">
              最大同時発信数
            </label>
            <input
              type="number"
              id="max_concurrent_calls"
              name="max_concurrent_calls"
              value={formData.max_concurrent_calls || 5}
              onChange={handleChange}
              min="1"
              max="30"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`bg-blue-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
              submitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
            }`}
          >
            {submitting ? '保存中...' : isEditMode ? '更新' : '作成'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignForm;