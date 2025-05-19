// frontend/src/components/CallerIDManagement.js
import React, { useState, useEffect } from 'react';
import { Phone, Edit, Trash2, Check, X, Upload, ChevronDown, ChevronRight, Plus, RefreshCw, AlertCircle, Server } from 'lucide-react';
import CallerIDImport from './CallerIDImport';

const CallerIDManagement = () => {
  const [callerIds, setCallerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    id: null,
    number: '',
    description: '',
    provider: '',
    domain: '',
    active: true
  });
  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [expandedCallerId, setExpandedCallerId] = useState(null);
  const [channels, setChannels] = useState({});
  const [loadingChannels, setLoadingChannels] = useState({});
  const [channelFormData, setChannelFormData] = useState({
    username: '',
    password: '',
    caller_id_id: null
  });
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [channelFormMode, setChannelFormMode] = useState('add'); // 'add' または 'edit'
  const [editingChannelId, setEditingChannelId] = useState(null);
  const [showChannelImport, setShowChannelImport] = useState(false);
  const [selectedCallerId, setSelectedCallerId] = useState(null);

  // 環境変数からAPIのベースURLを取得
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  // 発信者番号一覧を取得
  useEffect(() => {
    fetchCallerIds();
  }, []);

  const fetchCallerIds = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用');
        // モックデータのセット
        setTimeout(() => {
          const mockData = [
            { 
              id: 1, 
              number: '03-5946-8520', 
              description: '東京オフィス', 
              provider: 'SIP Provider A', 
              domain: 'ito258258.site',
              active: true,
              channelCount: 20,
              availableChannels: 15
            },
            { 
              id: 2, 
              number: '03-3528-9538', 
              description: '大阪オフィス', 
              provider: 'SIP Provider A', 
              domain: 'ito258258.site',
              active: true,
              channelCount: 20,
              availableChannels: 18
            },
            { 
              id: 3, 
              number: '050-1234-5678', 
              description: 'マーケティング部', 
              provider: 'Twilio',
              domain: 'twilio.com',
              active: false,
              channelCount: 5,
              availableChannels: 5
            }
          ];
          setCallerIds(mockData);
          setLoading(false);
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids`);
      
      const response = await fetch(`${apiBaseUrl}/caller-ids`, {
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
      console.error('API呼び出しエラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 特定の発信者番号のチャンネル一覧を取得
  const fetchChannels = async (callerId) => {
    setLoadingChannels(prev => ({ ...prev, [callerId]: true }));
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - チャンネル取得');
        
        // モックデータのセット
        setTimeout(() => {
          const prefix = callerId === 1 ? '03080' : callerId === 2 ? '03090' : '05010';
          const channelCount = callerId === 3 ? 5 : 20;
          
          const mockChannels = Array.from({ length: channelCount }, (_, i) => {
            const num = (i + 1).toString().padStart(2, '0');
            return {
              id: parseInt(`${callerId}${i+1}`),
              caller_id_id: callerId,
              username: `${prefix}${num}`,
              password: Math.floor(10000000 + Math.random() * 90000000).toString(),
              status: i % 5 === 0 ? 'busy' : 'available',
              last_used: i % 5 === 0 ? new Date().toISOString() : null
            };
          });
          
          setChannels(prev => ({ ...prev, [callerId]: mockChannels }));
          setLoadingChannels(prev => ({ ...prev, [callerId]: false }));
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids/${callerId}/channels`);
      
      const response = await fetch(`${apiBaseUrl}/caller-ids/${callerId}/channels`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('チャンネルの取得に失敗しました');
      }
      
      const data = await response.json();
      setChannels(prev => ({ ...prev, [callerId]: data }));
    } catch (err) {
      console.error('チャンネル取得エラー:', err);
      setSubmitError(err.message);
    } finally {
      setLoadingChannels(prev => ({ ...prev, [callerId]: false }));
    }
  };

  // チャンネルの状態をリセット
  const resetChannels = async (callerId) => {
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - チャンネルリセット');
        
        setTimeout(() => {
          const resetChannels = (channels[callerId] || []).map(channel => ({
            ...channel,
            status: 'available',
            last_used: null
          }));
          
          setChannels(prev => ({ ...prev, [callerId]: resetChannels }));
          setSuccessMessage('チャンネル状態をリセットしました');
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids/${callerId}/channels/reset`);
      
      const response = await fetch(`${apiBaseUrl}/caller-ids/${callerId}/channels/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'チャンネルのリセットに失敗しました');
      }
      
      // 再取得
      await fetchChannels(callerId);
      setSuccessMessage('チャンネル状態をリセットしました');
    } catch (err) {
      console.error('チャンネルリセットエラー:', err);
      setSubmitError(err.message);
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

  // チャンネルフォームの入力変更ハンドラ
  const handleChannelInputChange = (e) => {
    const { name, value } = e.target;
    setChannelFormData({
      ...channelFormData,
      [name]: value
    });
  };

  // 新規作成フォームのリセット
  const resetForm = () => {
    console.log('フォームをリセットします');
    setTimeout(() => {
      setFormData({
        id: null,
        number: '',
        description: '',
        provider: '',
        domain: '',
        active: true
      });
      setIsEditing(false);
      setSubmitError(null);
      console.log('フォームリセット完了');
    }, 10); // 短い遅延を入れて状態更新の競合を避ける
  };

  // チャンネルフォームのリセット
  const resetChannelForm = () => {
    setChannelFormData({
      username: '',
      password: '',
      caller_id_id: null
    });
    setShowChannelForm(false);
    setChannelFormMode('add');
    setEditingChannelId(null);
    setSubmitError(null);
  };

  // 発信者番号の展開/収縮
  const toggleExpand = (callerId) => {
    if (expandedCallerId === callerId) {
      setExpandedCallerId(null);
    } else {
      setExpandedCallerId(callerId);
      // 展開時にチャンネル情報を取得
      if (!channels[callerId]) {
        fetchChannels(callerId);
      }
    }
  };

  // 編集モードの開始
  const handleEdit = (callerId) => {
    console.log('編集ボタンクリック - ID:', callerId, '- タイプ:', typeof callerId);
    
    // 該当の発信者番号データを検索
    const callerIdToEdit = callerIds.find(c => c.id === callerId);
    console.log('編集対象データ:', callerIdToEdit);
    
    // データが見つからない場合の処理
    if (!callerIdToEdit) {
      console.error('指定されたIDの発信者番号が見つかりません:', callerId);
      setSubmitError('発信者番号データの取得に失敗しました');
      return;
    }
    
    // フォームデータを設定
    setFormData({
      id: callerIdToEdit.id,
      number: callerIdToEdit.number || '',
      description: callerIdToEdit.description || '',
      provider: callerIdToEdit.provider || '',
      domain: callerIdToEdit.domain || '',
      active: callerIdToEdit.active !== false // falseの場合のみfalse、それ以外はtrue
    });
    
    // 編集モードに切り替え
    setIsEditing(true);
    setSubmitError(null);
    
    // フォームにスクロール
    document.querySelector('.bg-white.rounded-lg.shadow.p-6')?.scrollIntoView({ behavior: 'smooth' });
    
    console.log('編集モード開始 - フォームデータ:', formData);
  };

  // チャンネル編集モードの開始
  const handleEditChannel = (channel) => {
    setChannelFormData({
      username: channel.username,
      password: '',  // パスワードは表示しない
      caller_id_id: channel.caller_id_id
    });
    setEditingChannelId(channel.id);
    setChannelFormMode('edit');
    setShowChannelForm(true);
    setSubmitError(null);
  };

  // チャンネル追加モードの開始
  const handleAddChannel = (callerId) => {
    setChannelFormData({
      username: '',
      password: '',
      caller_id_id: callerId
    });
    setChannelFormMode('add');
    setShowChannelForm(true);
    setSelectedCallerId(callerId);
    setSubmitError(null);
  };

  // チャンネルインポートモードの開始
  const handleImportChannels = (callerId) => {
    setShowChannelImport(true);
    setSelectedCallerId(callerId);
  };

  // 発信者番号の保存（新規作成/更新）
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    
    console.log('送信開始 - フォームデータ:', formData);
    console.log('更新モード:', formData.id !== null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('認証トークンが見つかりません');
        setSubmitError('認証エラー: ログインが必要です');
        return;
      }
      
      const isUpdate = formData.id !== null;
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - 保存処理');
        // 以下は既存のコード
        setTimeout(() => {
          if (isUpdate) {
            // 更新処理のシミュレーション
            const updatedCallerId = { ...formData };
            setCallerIds(callerIds.map(c => c.id === updatedCallerId.id ? updatedCallerId : c));
            setSuccessMessage('発信者番号を更新しました');
          } else {
            // 新規作成のシミュレーション
            const newCallerId = { 
              ...formData,
              id: Math.max(...callerIds.map(c => c.id)) + 1,
              channelCount: 0,
              availableChannels: 0
            };
            setCallerIds([...callerIds, newCallerId]);
            setSuccessMessage('新しい発信者番号を登録しました');
          }
          resetForm();
        }, 500);
        return;
      }
      
      const url = isUpdate 
        ? `${apiBaseUrl}/caller-ids/${formData.id}`
        : `${apiBaseUrl}/caller-ids`;
      
      const method = isUpdate ? 'PUT' : 'POST';
      
      console.log('API呼び出しの詳細:', {
        url,
        method,
        token: token ? '取得済み' : '未取得',
        body: formData
      });
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      console.log('API応答ステータス:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || '保存に失敗しました';
        } catch (parseError) {
          errorMessage = `APIエラー: ${response.status} ${response.statusText}`;
          console.error('応答の解析に失敗:', errorText);
        }
        
        throw new Error(errorMessage);
      }
      
      const savedCallerId = await response.json();
      console.log('保存成功 - 応答データ:', savedCallerId);
      
      if (isUpdate) {
        setCallerIds(callerIds.map(c => c.id === savedCallerId.id ? savedCallerId : c));
        setSuccessMessage('発信者番号を更新しました');
      } else {
        setCallerIds([...callerIds, savedCallerId]);
        setSuccessMessage('新しい発信者番号を登録しました');
      }
      
      resetForm();
    } catch (err) {
      console.error('保存エラー:', err);
      setSubmitError(err.message);
    }
  };

  // チャンネルの保存（新規作成/更新）
  const handleSubmitChannel = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    
    try {
      const token = localStorage.getItem('token');
      const isUpdate = channelFormMode === 'edit';
      const callerId = channelFormData.caller_id_id;
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - チャンネル保存処理');
        
        setTimeout(() => {
          if (isUpdate) {
            // 更新処理のシミュレーション
            const updatedChannels = channels[callerId].map(ch => 
              ch.id === editingChannelId 
                ? { ...ch, username: channelFormData.username, password: '********' }
                : ch
            );
            
            setChannels(prev => ({ ...prev, [callerId]: updatedChannels }));
            setSuccessMessage('チャンネルを更新しました');
          } else {
            // 新規作成のシミュレーション
            const newChannel = { 
              id: Date.now(),
              caller_id_id: callerId,
              username: channelFormData.username,
              password: '********',
              status: 'available',
              last_used: null
            };
            
            const updatedChannels = channels[callerId] 
              ? [...channels[callerId], newChannel]
              : [newChannel];
            
            setChannels(prev => ({ ...prev, [callerId]: updatedChannels }));
            
            // 発信者番号のチャンネル数も更新
            const updatedCallerIds = callerIds.map(c => {
              if (c.id === callerId) {
                return {
                  ...c,
                  channelCount: (c.channelCount || 0) + 1,
                  availableChannels: (c.availableChannels || 0) + 1
                };
              }
              return c;
            });
            
            setCallerIds(updatedCallerIds);
            setSuccessMessage('新しいチャンネルを登録しました');
          }
          
          resetChannelForm();
        }, 500);
        return;
      }
      
      const url = isUpdate 
        ? `${apiBaseUrl}/caller-ids/channels/${editingChannelId}`
        : `${apiBaseUrl}/caller-ids/${callerId}/channels`;
      
      const method = isUpdate ? 'PUT' : 'POST';
      
      console.log('API呼び出し:', url, method);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(channelFormData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '保存に失敗しました');
      }
      
      // 再取得
      await fetchChannels(callerId);
      
      // 発信者番号一覧も再取得（チャンネル数の更新のため）
      await fetchCallerIds();
      
      resetChannelForm();
      setSuccessMessage(isUpdate ? 'チャンネルを更新しました' : '新しいチャンネルを登録しました');
    } catch (err) {
      console.error('チャンネル保存エラー:', err);
      setSubmitError(err.message);
    }
  };

  // 発信者番号の削除
  const handleDelete = async (id) => {
    if (!window.confirm('この発信者番号を削除してもよろしいですか？登録されているすべてのチャンネルも削除され、キャンペーンで使用されている場合は削除できません。')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - 削除処理');
        // モックデータのセット
        setTimeout(() => {
          setCallerIds(callerIds.filter(c => c.id !== id));
          // チャンネルも削除
          setChannels(prev => {
            const updated = { ...prev };
            delete updated[id];
            return updated;
          });
          setSuccessMessage('発信者番号を削除しました');
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids/${id}`, 'DELETE');
      
      const response = await fetch(`${apiBaseUrl}/caller-ids/${id}`, {
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
      // チャンネルも削除
      setChannels(prev => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      setSuccessMessage('発信者番号を削除しました');
    } catch (err) {
      console.error('削除エラー:', err);
      setSubmitError(err.message);
    }
  };

  // チャンネルの削除
  const handleDeleteChannel = async (channel) => {
    if (!window.confirm(`チャンネル ${channel.username} を削除してもよろしいですか？`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const callerId = channel.caller_id_id;
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - チャンネル削除処理');
        
        setTimeout(() => {
          const updatedChannels = channels[callerId].filter(ch => ch.id !== channel.id);
          setChannels(prev => ({ ...prev, [callerId]: updatedChannels }));
          
          // 発信者番号のチャンネル数も更新
          const updatedCallerIds = callerIds.map(c => {
            if (c.id === callerId) {
              return {
                ...c,
                channelCount: (c.channelCount || 0) - 1,
                availableChannels: channel.status === 'available' 
                  ? (c.availableChannels || 0) - 1
                  : (c.availableChannels || 0)
              };
            }
            return c;
          });
          
          setCallerIds(updatedCallerIds);
          setSuccessMessage('チャンネルを削除しました');
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids/channels/${channel.id}`, 'DELETE');
      
      const response = await fetch(`${apiBaseUrl}/caller-ids/channels/${channel.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'チャンネルの削除に失敗しました');
      }
      
      // 再取得
      await fetchChannels(callerId);
      
      // 発信者番号一覧も再取得（チャンネル数の更新のため）
      await fetchCallerIds();
      
      setSuccessMessage('チャンネルを削除しました');
    } catch (err) {
      console.error('チャンネル削除エラー:', err);
      setSubmitError(err.message);
    }
  };

  // 発信者番号の有効/無効切り替え
  const handleToggleStatus = async (id) => {
    const callerId = callerIds.find(c => c.id === id);
    
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - ステータス切り替え');
        // モックデータのセット
        setTimeout(() => {
          const updatedCallerId = { ...callerId, active: !callerId.active };
          setCallerIds(callerIds.map(c => c.id === id ? updatedCallerId : c));
          setSuccessMessage(`発信者番号を${updatedCallerId.active ? '有効' : '無効'}にしました`);
        }, 500);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids/${id}`, 'PUT');
      
      const response = await fetch(`${apiBaseUrl}/caller-ids/${id}`, {
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
      console.error('ステータス切り替えエラー:', err);
      setSubmitError(err.message);
    }
  };

  // システム全体のチャンネル状態を同期
  const handleSyncChannels = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        console.log('開発環境でモックデータを使用 - チャンネル状態同期');
        
        setTimeout(() => {
          setSuccessMessage('チャンネル状態を同期しました');
          // 更新のためにデータを再取得
          fetchCallerIds();
          
          // 展開中の発信者番号のチャンネルを再取得
          if (expandedCallerId) {
            fetchChannels(expandedCallerId);
          }
        }, 800);
        return;
      }
      
      console.log('API呼び出し:', `${apiBaseUrl}/caller-ids/sync`);
      
      const response = await fetch(`${apiBaseUrl}/caller-ids/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'チャンネル状態の同期に失敗しました');
      }
      
      setSuccessMessage('チャンネル状態を同期しました');
      
      // 更新のためにデータを再取得
      await fetchCallerIds();
      
      // 展開中の発信者番号のチャンネルを再取得
      if (expandedCallerId) {
        await fetchChannels(expandedCallerId);
      }
    } catch (err) {
      console.error('チャンネル状態同期エラー:', err);
      setSubmitError(err.message);
    }
  };

  // チャンネルインポート完了時の処理
  const handleChannelImportComplete = async () => {
    setShowChannelImport(false);
    
    if (selectedCallerId) {
      // チャンネル情報を再取得
      await fetchChannels(selectedCallerId);
      
      // 発信者番号一覧も再取得（チャンネル数の更新のため）
      await fetchCallerIds();
      
      setSuccessMessage('チャンネルのインポートが完了しました');
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
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>{submitError}</div>
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 flex items-center">
          <Check className="h-5 w-5 mr-2 flex-shrink-0" />
          <div>{successMessage}</div>
        </div>
      )}
      
      {/* アクション・バー */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">登録済み発信者番号</h2>
        <div className="flex space-x-2">
          <button
            onClick={handleSyncChannels}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            チャンネル状態を同期
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            {showImport ? 'インポートを閉じる' : 'CSVからインポート'}
          </button>
        </div>
      </div>

      {/* インポートフォーム */}
      {showImport && (
        <div className="mb-6">
          <CallerIDImport 
            onImportComplete={() => {
              setShowImport(false);
              fetchCallerIds();
            }} 
          />
        </div>
      )}
      
      {/* チャンネルインポートフォーム */}
      {showChannelImport && selectedCallerId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold mb-4">チャンネルをインポート</h3>
            <p className="mb-4 text-sm text-gray-600">
              発信者番号 {callerIds.find(c => c.id === selectedCallerId)?.number} のチャンネルをCSVからインポートします。
            </p>
            
            {/* ここにチャンネルインポートコンポーネントを配置 */}
            <div className="mb-4">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <p className="text-sm text-yellow-700">
                  CSVファイルには、少なくとも「ユーザー名」と「パスワード」の列が必要です。
                </p>
              </div>
              
              {/* 実際のインポートフォームはこちらに実装 */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowChannelImport(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleChannelImportComplete}
                  className="px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  インポート
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 発信者番号リスト（階層構造） */}
      <div className="mb-8">
        {callerIds.length === 0 ? (
          <p className="text-gray-500">登録されている発信者番号はありません</p>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10"></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">番号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">説明</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">プロバイダ/ドメイン</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">チャンネル</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状態</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {callerIds.map((callerId) => (
                  <React.Fragment key={callerId.id}>
                    {/* 発信者番号行 */}
                    <tr className="hover:bg-gray-50">
                      <td className="px-2 py-4 whitespace-nowrap">
                        <button 
                          onClick={() => toggleExpand(callerId.id)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          {expandedCallerId === callerId.id ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Phone className="h-5 w-5 mr-2 text-blue-500" />
                          <span className="font-medium">{callerId.number}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {callerId.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>{callerId.provider}</div>
                        <div className="text-xs text-gray-500">{callerId.domain}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Server className="h-4 w-4 mr-1 text-indigo-500" />
                          <span>{callerId.channelCount || 0}</span>
                          <span className="mx-1 text-gray-400">/</span>
                          <span className="text-green-500">{callerId.availableChannels || 0} 利用可能</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          callerId.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {callerId.active ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-3">
                          <button 
                            onClick={() => handleEdit(callerId.id)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="編集"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => handleToggleStatus(callerId.id)}
                            className={`hover:text-gray-900 ${
                              callerId.active ? 'text-red-600' : 'text-green-600'
                            }`}
                            title={callerId.active ? '無効にする' : '有効にする'}
                          >
                            {callerId.active ? <X size={16} /> : <Check size={16} />}
                          </button>
                          <button 
                            onClick={() => handleDelete(callerId.id)}
                            className="text-red-600 hover:text-red-900"
                            title="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* チャンネル行（展開時のみ表示） */}
                    {expandedCallerId === callerId.id && (
                      <tr>
                        <td colSpan="7" className="px-6 py-2 bg-gray-50">
                          <div className="border-l-2 border-indigo-400 pl-4 py-2">
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-sm font-medium text-gray-700">チャンネル一覧</h3>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleAddChannel(callerId.id)}
                                  className="flex items-center px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  チャンネル追加
                                </button>
                                <button
                                  onClick={() => handleImportChannels(callerId.id)}
                                  className="flex items-center px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  CSVインポート
                                </button>
                                <button
                                  onClick={() => resetChannels(callerId.id)}
                                  className="flex items-center px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  状態リセット
                                </button>
                              </div>
                            </div>
                            
                            {loadingChannels[callerId.id] ? (
                              <div className="py-4 text-center text-gray-500">チャンネル情報を読み込み中...</div>
                            ) : channels[callerId.id] && channels[callerId.id].length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ユーザー名</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最終使用</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {channels[callerId.id].map((channel) => (
                                      <tr key={channel.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                                          {channel.username}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap">
                                          <span className={`px-2 py-1 inline-flex text-xs leading-4 font-medium rounded-full ${
                                            channel.status === 'available' ? 'bg-green-100 text-green-800' :
                                            channel.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-red-100 text-red-800'
                                          }`}>
                                            {channel.status === 'available' ? '利用可能' :
                                             channel.status === 'busy' ? '使用中' : 'エラー'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                          {channel.last_used ? new Date(channel.last_used).toLocaleString() : '-'}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                          <div className="flex space-x-2">
                                            <button
                                              onClick={() => handleEditChannel(channel)}
                                              className="text-indigo-600 hover:text-indigo-900"
                                              title="編集"
                                            >
                                              <Edit size={14} />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteChannel(channel)}
                                              className="text-red-600 hover:text-red-900"
                                              title="削除"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="py-4 text-center text-gray-500">
                                チャンネルが登録されていません。「チャンネル追加」ボタンから追加できます。
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* チャンネルフォーム（モーダル） */}
      {showChannelForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">
              {channelFormMode === 'add' ? 'チャンネルを追加' : 'チャンネルを編集'}
            </h3>
            
            <form onSubmit={handleSubmitChannel}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
                  ユーザー名 *
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="例: 03080001"
                  value={channelFormData.username}
                  onChange={handleChannelInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  required
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                  パスワード {channelFormMode === 'edit' && '(変更する場合のみ入力)'}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="パスワード"
                  value={channelFormData.password}
                  onChange={handleChannelInputChange}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  {...(channelFormMode === 'add' ? { required: true } : {})}
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={resetChannelForm}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  {channelFormMode === 'add' ? '追加' : '更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* 発信者番号フォーム */}
      <div id="edit-form" className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">
          {isEditing ? '発信者番号を編集' : '新しい発信者番号を追加'}
        </h2>
        <form onSubmit={handleSubmit} id="caller-id-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="number">
                電話番号 *
              </label>
              <input
                id="number"
                name="number"
                type="text"
                placeholder="例: 03-5946-8520（ハイフンあり）"
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
                placeholder="例: SIP Provider"
                value={formData.provider}
                onChange={handleInputChange}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="domain">
                ドメイン
              </label>
              <input
                id="domain"
                name="domain"
                type="text"
                placeholder="例: ito258258.site"
                value={formData.domain}
                onChange={handleInputChange}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>
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
      
      {/* 使用方法説明 */}
      <div className="mt-8 bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h3 className="text-lg font-semibold mb-2 text-blue-800">発信者番号とチャンネルについて</h3>
        <p className="text-sm text-blue-700 mb-2">
          このシステムでは、発信者番号（例: 03-5946-8520）と、その発信者番号に紐づく複数のチャンネル（例: 03080001, 03080002...）を
          管理できます。チャンネルはSIPアカウント（ユーザー名とパスワード）として使用され、実際の発信に利用されます。
        </p>
        <ul className="list-disc list-inside text-sm text-blue-700 ml-2 space-y-1">
          <li>発信者番号を追加した後、対応するチャンネルを追加してください</li>
          <li>チャンネルはCSVファイルからまとめてインポートすることも可能です</li>
          <li>使用中のチャンネルは自動的に「使用中」状態になります</li>
          <li>「状態リセット」ボタンを使用すると、すべてのチャンネルを「利用可能」状態に戻せます</li>
          <li>「チャンネル状態を同期」ボタンを使用すると、実際のシステム状態と同期できます</li>
        </ul>
      </div>
    </div>
  );
};

export default CallerIDManagement;