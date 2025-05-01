import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const CampaignForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    caller_id_id: '',
    script: '',
    retry_attempts: 0,
    max_concurrent_calls: 5,
    schedule_start: '',
    schedule_end: '',
    working_hours_start: '09:00',
    working_hours_end: '18:00'
  });
  
  const [callerIds, setCallerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  
  // 初期データの読み込み
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // 発信者番号の取得
        const callerIdResponse = await fetch('/api/caller-ids', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!callerIdResponse.ok) {
          throw new Error('発信者番号の取得に失敗しました');
        }
        
        const callerIdData = await callerIdResponse.json();
        setCallerIds(callerIdData);
        
        // 編集時はキャンペーンデータを取得
        if (isEditing) {
          const campaignResponse = await fetch(`/api/campaigns/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!campaignResponse.ok) {
            throw new Error('キャンペーンデータの取得に失敗しました');
          }
          
          const campaignData = await campaignResponse.json();
          
          // 日時形式の調整
          const formattedData = {
            ...campaignData,
            schedule_start: campaignData.schedule_start ? campaignData.schedule_start.substring(0, 16) : '',
            schedule_end: campaignData.schedule_end ? campaignData.schedule_end.substring(0, 16) : '',
            working_hours_start: campaignData.working_hours_start ? campaignData.working_hours_start.substring(0, 5) : '09:00',
            working_hours_end: campaignData.working_hours_end ? campaignData.working_hours_end.substring(0, 5) : '18:00'
          };
          
          setFormData(formattedData);
        } else if (callerIdData.length > 0) {
          // 新規作成時に最初の発信者番号を選択
          setFormData(prev => ({
            ...prev,
            caller_id_id: callerIdData[0].id
          }));
        }
        
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id, isEditing]);
  
  // 入力変更ハンドラ
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    setFormData({
      ...formData,
      [name]: type === 'number' ? parseInt(value, 10) : value
    });
  };
  
  // フォーム送信ハンドラ
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    
    try {
      const token = localStorage.getItem('token');
      const url = isEditing ? `/api/campaigns/${id}` : '/api/campaigns';
      const method = isEditing ? 'PUT' : 'POST';
      
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
      
      // 成功したら一覧画面に戻る
      navigate('/campaigns');
    } catch (err) {
      setSubmitError(err.message);
      window.scrollTo(0, 0);
    }
  };
  
  if (loading) {
    return <div className="text-center p-4">読み込み中...</div>;
  }
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        {isEditing ? 'キャンペーンの編集' : '新規キャンペーン作成'}
      </h1>
      
      {(error || submitError) && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error || submitError}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
            キャンペーン名 *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="キャンペーン名"
            value={formData.name}
            onChange={handleInputChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
            説明
          </label>
          <textarea
            id="description"
            name="description"
            placeholder="キャンペーンの説明"
            value={formData.description || ''}
            onChange={handleInputChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            rows="3"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="caller_id_id">
            発信者番号 *
          </label>
          <select
            id="caller_id_id"
            name="caller_id_id"
            value={formData.caller_id_id}
            onChange={handleInputChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            required
          >
            <option value="">発信者番号を選択してください</option>
            {callerIds.map(callerId => (
              <option key={callerId.id} value={callerId.id} disabled={!callerId.active}>
                {callerId.number} - {callerId.description} {!callerId.active && '(無効)'}
              </option>
            ))}
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="script">
            通話スクリプト
          </label>
          <textarea
            id="script"
            name="script"
            placeholder="通話スクリプトを入力してください"
            value={formData.script || ''}
            onChange={handleInputChange}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            rows="5"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="retry_attempts">
              リトライ回数
            </label>
            <input
              id="retry_attempts"
              name="retry_attempts"
              type="number"
              min="0"
              max="5"
              value={formData.retry_attempts}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="max_concurrent_calls">
              最大同時発信数
            </label>
            <input
              id="max_concurrent_calls"
              name="max_concurrent_calls"
              type="number"
              min="1"
              max="50"
              value={formData.max_concurrent_calls}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="schedule_start">
              スケジュール開始日時
            </label>
            <input
              id="schedule_start"
              name="schedule_start"
              type="datetime-local"
              value={formData.schedule_start}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="schedule_end">
              スケジュール終了日時
            </label>
            <input
              id="schedule_end"
              name="schedule_end"
              type="datetime-local"
              value={formData.schedule_end}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="working_hours_start">
              発信開始時間
            </label>
            <input
              id="working_hours_start"
              name="working_hours_start"
              type="time"
              value={formData.working_hours_start}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="working_hours_end">
              発信終了時間
            </label>
            <input
              id="working_hours_end"
              name="working_hours_end"
              type="time"
              value={formData.working_hours_end}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            {isEditing ? '更新' : '作成'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignForm;