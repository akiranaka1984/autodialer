import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';

const CampaignForm = () => {
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const isEditing = !!campaignId;
  
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  
  // データの初期読み込み
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        
        // 開発環境用モックデータ
        if (process.env.NODE_ENV === 'development') {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 発信者番号のモックデータ
          const mockCallerIds = [
            { id: 1, number: '0312345678', description: '東京オフィス', active: true },
            { id: 2, number: '0312345679', description: '大阪オフィス', active: true },
            { id: 3, number: '0501234567', description: 'マーケティング部', active: false }
          ];
          setCallerIds(mockCallerIds);
          
          // 編集時は既存のキャンペーンデータをロード
          if (isEditing) {
            const mockCampaign = {
              id: parseInt(campaignId),
              name: 'テストキャンペーン',
              description: '既存のキャンペーンの説明',
              caller_id_id: 1,
              script: 'こんにちは、{会社名}の{担当者名}です。',
              retry_attempts: 2,
              max_concurrent_calls: 10,
              schedule_start: '2025-05-10T09:00',
              schedule_end: '2025-05-20T18:00',
              working_hours_start: '09:00',
              working_hours_end: '18:00'
            };
            setFormData(mockCampaign);
          } else if (mockCallerIds.length > 0) {
            setFormData(prev => ({
              ...prev,
              caller_id_id: mockCallerIds[0].id
            }));
          }
          
          setLoading(false);
          return;
        }
        
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
          const campaignResponse = await fetch(`/api/campaigns/${campaignId}`, {
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
          // 新規作成時にアクティブな発信者番号の最初のものを選択
          const activeCallerIds = callerIdData.filter(ci => ci.active);
          if (activeCallerIds.length > 0) {
            setFormData(prev => ({
              ...prev,
              caller_id_id: activeCallerIds[0].id
            }));
          }
        }
        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [campaignId, isEditing]);
  
  // フォームバリデーション
  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'キャンペーン名は必須です';
    }
    
    if (!formData.caller_id_id) {
      errors.caller_id_id = '発信者番号を選択してください';
    }
    
    if (formData.retry_attempts < 0 || formData.retry_attempts > 5) {
      errors.retry_attempts = 'リトライ回数は0〜5の間で設定してください';
    }
    
    if (formData.max_concurrent_calls < 1 || formData.max_concurrent_calls > 50) {
      errors.max_concurrent_calls = '最大同時発信数は1〜50の間で設定してください';
    }
    
    if (formData.schedule_start && formData.schedule_end) {
      const start = new Date(formData.schedule_start);
      const end = new Date(formData.schedule_end);
      if (start >= end) {
        errors.schedule_end = '終了日時は開始日時より後に設定してください';
      }
    }
    
    if (formData.working_hours_start && formData.working_hours_end) {
      const start = formData.working_hours_start.split(':').map(Number);
      const end = formData.working_hours_end.split(':').map(Number);
      const startMinutes = start[0] * 60 + start[1];
      const endMinutes = end[0] * 60 + end[1];
      
      if (startMinutes >= endMinutes) {
        errors.working_hours_end = '終了時間は開始時間より後に設定してください';
      }
    }
    
    return errors;
  };
  
  // 入力変更ハンドラ
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    setFormData({
      ...formData,
      [name]: type === 'number' ? parseInt(value, 10) : value
    });
    
    // バリデーションエラーをクリア
    if (validationErrors[name]) {
      setValidationErrors({
        ...validationErrors,
        [name]: null
      });
    }
  };
  
  // フォーム送信ハンドラ
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
      
      // 作成または更新のURLを決定
      const url = isEditMode
        ? `${apiBaseUrl}/campaigns/${campaignId}`
        : `${apiBaseUrl}/campaigns`;
      
      const method = isEditMode ? 'PUT' : 'POST';
      
      console.log(`キャンペーン${isEditMode ? '更新' : '作成'}リクエスト:`, formData);
      
      // API呼び出し
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      // レスポンスのエラーチェック
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `キャンペーンの${isEditMode ? '更新' : '作成'}に失敗しました`);
      }
      
      const data = await response.json();
      console.log(`キャンペーン${isEditMode ? '更新' : '作成'}成功:`, data);
      
      // 成功メッセージを設定
      setSuccess(true);
      
      // キャンペーン一覧に戻る（遅延を入れてメッセージを表示）
      setTimeout(() => {
        navigate('/campaigns');
      }, 1500);
    } catch (error) {
      console.error(`キャンペーン${isEditMode ? '更新' : '作成'}エラー:`, error);
      setError(error.message);
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
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
  
  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        {isEditing ? 'キャンペーンの編集' : '新規キャンペーン作成'}
      </h1>
      
      {submitError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{submitError}</p>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        {/* 基本情報 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">基本情報</h2>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
              キャンペーン名 *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                validationErrors.name ? 'border-red-500' : ''
              }`}
              placeholder="例：新規顧客開拓キャンペーン"
            />
            {validationErrors.name && (
              <p className="text-red-500 text-xs italic mt-1">{validationErrors.name}</p>
            )}
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
              説明
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              rows="3"
              placeholder="キャンペーンの目的や概要を入力してください"
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
              className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                validationErrors.caller_id_id ? 'border-red-500' : ''
              }`}
            >
              <option value="">選択してください</option>
              {callerIds.map(callerId => (
                <option key={callerId.id} value={callerId.id} disabled={!callerId.active}>
                  {callerId.number} - {callerId.description} {!callerId.active && '(無効)'}
                </option>
              ))}
            </select>
            {validationErrors.caller_id_id && (
              <p className="text-red-500 text-xs italic mt-1">{validationErrors.caller_id_id}</p>
            )}
          </div>
        </div>
        
        {/* スクリプト設定 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">スクリプト設定</h2>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="script">
              通話スクリプト
            </label>
            <textarea
              id="script"
              name="script"
              value={formData.script}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              rows="5"
              placeholder="通話時に使用するスクリプトを入力してください。&#10;変数を使用できます：{会社名}, {担当者名}, {商品名} など"
            />
            <p className="text-gray-600 text-xs mt-1">
              利用可能な変数: {'{会社名}'}, {'{担当者名}'}, {'{商品名}'}
            </p>
          </div>
        </div>
        
        {/* 発信設定 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">発信設定</h2>
          
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
                className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                  validationErrors.retry_attempts ? 'border-red-500' : ''
                }`}
              />
              {validationErrors.retry_attempts && (
                <p className="text-red-500 text-xs italic mt-1">{validationErrors.retry_attempts}</p>
              )}
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
                className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                  validationErrors.max_concurrent_calls ? 'border-red-500' : ''
                }`}
              />
              {validationErrors.max_concurrent_calls && (
                <p className="text-red-500 text-xs italic mt-1">{validationErrors.max_concurrent_calls}</p>
              )}
            </div>
          </div>
        </div>
        
        {/* スケジュール設定 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">スケジュール設定</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="schedule_start">
                開始日時
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
                終了日時
              </label>
              <input
                id="schedule_end"
                name="schedule_end"
                type="datetime-local"
                value={formData.schedule_end}
                onChange={handleInputChange}
                className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                  validationErrors.schedule_end ? 'border-red-500' : ''
                }`}
              />
              {validationErrors.schedule_end && (
                <p className="text-red-500 text-xs italic mt-1">{validationErrors.schedule_end}</p>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="working_hours_start">
                営業時間（開始）
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
                営業時間（終了）
              </label>
              <input
                id="working_hours_end"
                name="working_hours_end"
                type="time"
                value={formData.working_hours_end}
                onChange={handleInputChange}
                className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${
                  validationErrors.working_hours_end ? 'border-red-500' : ''
                }`}
              />
              {validationErrors.working_hours_end && (
                <p className="text-red-500 text-xs italic mt-1">{validationErrors.working_hours_end}</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
              saving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {saving ? (
              <span className="flex items-center">
                <Loader className="animate-spin h-5 w-5 mr-2" />
                保存中...
              </span>
            ) : (
              isEditing ? '更新' : '作成'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignForm;