// frontend/src/components/OperatorInterface/OperatorDashboard.js
import React, { useState, useEffect } from 'react';
import { Phone, User, Headphones, ChevronDown, ChevronUp, Calendar, Clock, Coffee, PhoneOff, UserCheck } from 'lucide-react';

const OperatorDashboard = () => {
  const [operatorStatus, setOperatorStatus] = useState('offline'); // offline, available, busy, break
  const [activeCall, setActiveCall] = useState(null);
  const [callQueue, setCallQueue] = useState([]);
  const [queueStats, setQueueStats] = useState({ size: 0, maxSize: 20, waitTime: 0 });
  const [dailyStats, setDailyStats] = useState({ calls: 0, completed: 0, avgDuration: 0 });
  const [callHistory, setCallHistory] = useState([]);
  const [callNotes, setCallNotes] = useState('');
  const [satisfaction, setSatisfaction] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  // APIベースURL
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  // WebSocket接続
  const [socket, setSocket] = useState(null);
  const [operatorId, setOperatorId] = useState(1); // TODO: AuthContextから取得

  // 初期データの読み込み
  useEffect(() => {
    fetchOperatorData();
    fetchCallQueue();
    fetchCallHistory();
    
    const intervalId = setInterval(() => {
      fetchCallQueue();
      if (operatorStatus === 'available') {
        checkForIncomingCalls();
      }
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [operatorStatus]);

  // WebSocket接続
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    // 本番環境では実際のWebSocketサーバーに接続
    const wsUrl = process.env.NODE_ENV === 'production' 
      ? `wss://${window.location.host}/ws`
      : 'ws://localhost:5001/ws';
    
    const newSocket = new WebSocket(wsUrl);
    
    newSocket.onopen = () => {
      console.log('WebSocket接続確立');
      // 認証メッセージを送信
      newSocket.send(JSON.stringify({
        type: 'authenticate',
        token: token,
        operatorId: operatorId
      }));
    };
    
    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'authenticated':
            console.log('WebSocket認証成功');
            break;
          
          case 'callAssigned':
            handleIncomingCall(data.call);
            break;
          
          case 'queueUpdate':
            setCallQueue(data.queue);
            setQueueStats(data.stats);
            break;
          
          case 'error':
            console.error('WebSocketエラー:', data.message);
            break;
        }
      } catch (error) {
        console.error('WebSocketメッセージ処理エラー:', error);
      }
    };
    
    newSocket.onclose = () => {
      console.log('WebSocket接続終了');
    };
    
    newSocket.onerror = (error) => {
      console.error('WebSocketエラー:', error);
    };
    
    setSocket(newSocket);
    
    // クリーンアップ
    return () => {
      if (newSocket && newSocket.readyState === WebSocket.OPEN) {
        newSocket.close();
      }
    };
  }, [operatorId]);

  // オペレーターデータの取得
  const fetchOperatorData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        // 開発環境ではモックデータを使用
        setTimeout(() => {
          setOperatorStatus('offline'); // 初期状態
          setDailyStats({
            calls: 12,
            completed: 10,
            avgDuration: 180
          });
          setLoading(false);
        }, 500);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/operators/${operatorId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('オペレーター情報の取得に失敗しました');
      }
      
      const data = await response.json();
      setOperatorStatus(data.status);
      
      // 今日の統計情報を取得
      const statsResponse = await fetch(`${apiBaseUrl}/operators/${operatorId}/stats?period=day`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setDailyStats({
          calls: statsData.callStats.total_calls || 0,
          completed: statsData.callStats.completed_calls || 0,
          avgDuration: statsData.callStats.avg_duration || 0
        });
      }
      
      setLoading(false);
    } catch (error) {
      console.error('オペレーター情報取得エラー:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  // コールキューの取得
  const fetchCallQueue = async () => {
    try {
      if (process.env.NODE_ENV === 'development') {
        // 開発環境ではモックデータを使用
        setTimeout(() => {
          setCallQueue([
            { id: 1, callId: 'call-123', waitTime: 45, campaignName: 'サマーセール案内', contactName: '山田太郎', phoneNumber: '09012345678' },
            { id: 2, callId: 'call-124', waitTime: 30, campaignName: '新規顧客フォローアップ', contactName: '佐藤花子', phoneNumber: '09023456789' }
          ]);
          
          setQueueStats({
            size: 2,
            maxSize: 20,
            waitTime: 45
          });
        }, 800);
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBaseUrl}/operators/queue`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('キュー情報の取得に失敗しました');
      }
      
      const data = await response.json();
      setCallQueue(data.queue);
      setQueueStats({
        size: data.size,
        maxSize: data.maxSize,
        waitTime: data.estimatedWaitTime
      });
    } catch (error) {
      console.error('キュー情報取得エラー:', error);
      // エラーの場合でも続行するため、エラー状態は更新しない
    }
  };

  // 通話履歴の取得
  const fetchCallHistory = async () => {
    try {
      if (process.env.NODE_ENV === 'development') {
        // 開発環境ではモックデータを使用
        setTimeout(() => {
          setCallHistory([
            { id: 1, callId: 'call-120', startTime: '2025-05-05T14:30:00', endTime: '2025-05-05T14:35:00', duration: 300, disposition: 'completed', campaignName: 'サマーセール案内', contactName: '田中次郎', phoneNumber: '09034567890' },
            { id: 2, callId: 'call-119', startTime: '2025-05-05T13:45:00', endTime: '2025-05-05T13:49:00', duration: 240, disposition: 'completed', campaignName: '顧客満足度調査', contactName: '高橋三郎', phoneNumber: '09045678901' },
            { id: 3, callId: 'call-117', startTime: '2025-05-05T11:20:00', endTime: '2025-05-05T11:28:00', duration: 480, disposition: 'transferred', campaignName: '新規顧客フォローアップ', contactName: '鈴木四郎', phoneNumber: '09056789012' }
          ]);
        }, 800);
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBaseUrl}/operators/${operatorId}/calls`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('通話履歴の取得に失敗しました');
      }
      
      const data = await response.json();
      setCallHistory(data);
    } catch (error) {
      console.error('通話履歴取得エラー:', error);
      // エラーの場合でも続行するため、エラー状態は更新しない
    }
  };

  // 新規着信コールのチェック
  const checkForIncomingCalls = async () => {
    try {
      if (process.env.NODE_ENV === 'development') {
        // 開発環境では5%の確率で着信をシミュレーション
        if (Math.random() < 0.05 && operatorStatus === 'available') {
          const mockCall = {
            callId: `call-${Date.now()}`,
            campaignName: '新規顧客フォローアップ',
            contactName: '模擬顧客',
            phoneNumber: '09012345678',
            waitTime: 0,
            queueTime: new Date().toISOString()
          };
          
          handleIncomingCall(mockCall);
        }
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiBaseUrl}/operators/calls/next`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 204) {
        // 新規着信なし
        return;
      }
      
      if (!response.ok) {
        throw new Error('着信確認に失敗しました');
      }
      
      const call = await response.json();
      handleIncomingCall(call);
    } catch (error) {
      console.error('着信確認エラー:', error);
    }
  };

  // 着信コールの処理
  const handleIncomingCall = (call) => {
    if (operatorStatus !== 'available') {
      // 利用可能でない場合は着信を拒否
      rejectCall(call.callId);
      return;
    }
    
    // 着信音を再生
    playRingtone();
    
    // アクティブコールとして設定
    setActiveCall(call);
    
    // 通知を表示
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('新規着信', {
        body: `${call.contactName || '不明'} (${call.phoneNumber}) からの着信`,
        icon: '/phone-icon.png'
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  };

  // 着信音の再生
  const playRingtone = () => {
    const audio = new Audio('/ringtone.mp3');
    audio.loop = true;
    audio.play().catch(error => {
      console.error('着信音再生エラー:', error);
    });
    
    // activeCallが設定されたら停止
    const checkInterval = setInterval(() => {
      if (activeCall) {
        audio.pause();
        clearInterval(checkInterval);
      }
    }, 500);
    
    // 10秒後に自動停止
    setTimeout(() => {
      audio.pause();
      clearInterval(checkInterval);
    }, 10000);
  };

  // 通話の受け入れ
  const acceptCall = async () => {
    if (!activeCall) return;
    
    try {
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        // 開発環境ではステータス変更のみ
        setOperatorStatus('busy');
        // 通話ノートをリセット
        setCallNotes('');
        setSatisfaction(0);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/operators/call/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          callId: activeCall.callId
        })
      });
      
      if (!response.ok) {
        throw new Error('通話の受け入れに失敗しました');
      }
      
      // ステータスを更新
      setOperatorStatus('busy');
      
      // 通話ノートをリセット
      setCallNotes('');
      setSatisfaction(0);
    } catch (error) {
      console.error('通話受け入れエラー:', error);
      alert('通話の受け入れに失敗しました: ' + error.message);
    }
  };

  // 通話の拒否
  const rejectCall = async (callId) => {
    if (!callId) return;
    
    try {
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        // 開発環境では状態のリセットのみ
        setActiveCall(null);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/operators/call/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          callId: callId
        })
      });
      
      if (!response.ok) {
        throw new Error('通話の拒否に失敗しました');
      }
      
      // アクティブコールをクリア
      setActiveCall(null);
    } catch (error) {
      console.error('通話拒否エラー:', error);
      // エラーが発生しても状態をクリア
      setActiveCall(null);
    }
  };

  // 通話の完了
  const completeCall = async () => {
    if (!activeCall) return;
    
    try {
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        // 開発環境では状態のリセットと履歴の更新
        setOperatorStatus('available');
        setActiveCall(null);
        
        // 通話履歴に追加
        const newCall = {
          id: Date.now(),
          callId: activeCall.callId,
          startTime: new Date(Date.now() - 300000).toISOString(), // 5分前
          endTime: new Date().toISOString(),
          duration: 300,
          disposition: 'completed',
          campaignName: activeCall.campaignName,
          contactName: activeCall.contactName,
          phoneNumber: activeCall.phoneNumber,
          notes: callNotes,
          satisfaction: satisfaction
        };
        
        setCallHistory([newCall, ...callHistory]);
        
        // 通話ノートをリセット
        setCallNotes('');
        setSatisfaction(0);
        
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/operators/call/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          callId: activeCall.callId,
          notes: callNotes,
          disposition: 'completed',
          satisfaction: satisfaction
        })
      });
      
      if (!response.ok) {
        throw new Error('通話の完了に失敗しました');
      }
      
      // ステータスを更新
      setOperatorStatus('available');
      
      // アクティブコールをクリア
      setActiveCall(null);
      
      // 通話履歴を更新
      fetchCallHistory();
      
      // 通話ノートをリセット
      setCallNotes('');
      setSatisfaction(0);
    } catch (error) {
      console.error('通話完了エラー:', error);
      alert('通話の完了に失敗しました: ' + error.message);
    }
  };

  // オペレーターステータスの変更
  const changeOperatorStatus = async (newStatus) => {
    try {
      const token = localStorage.getItem('token');
      
      if (process.env.NODE_ENV === 'development') {
        // 開発環境では状態の更新のみ
        setOperatorStatus(newStatus);
        setShowStatusDialog(false);
        setStatusChangeReason('');
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/operators/${operatorId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus,
          reason: statusChangeReason
        })
      });
      
      if (!response.ok) {
        throw new Error('ステータスの変更に失敗しました');
      }
      
      // ステータスを更新
      setOperatorStatus(newStatus);
      
      // ダイアログを閉じる
      setShowStatusDialog(false);
      setStatusChangeReason('');
    } catch (error) {
      console.error('ステータス変更エラー:', error);
      alert('ステータスの変更に失敗しました: ' + error.message);
    }
  };

  // ステータス変更ダイアログを表示
  const openStatusDialog = (status) => {
    setShowStatusDialog(true);
    // 選択中のステータスを仮設定
    setOperatorStatus(status);
  };

  // ステータスアイコンと色を取得
  const getStatusIcon = (status) => {
    switch (status) {
      case 'available':
        return { icon: <UserCheck className="w-5 h-5" />, color: 'text-green-500', bgColor: 'bg-green-100' };
      case 'busy':
        return { icon: <Phone className="w-5 h-5" />, color: 'text-red-500', bgColor: 'bg-red-100' };
      case 'break':
        return { icon: <Coffee className="w-5 h-5" />, color: 'text-yellow-500', bgColor: 'bg-yellow-100' };
      case 'offline':
      default:
        return { icon: <PhoneOff className="w-5 h-5" />, color: 'text-gray-500', bgColor: 'bg-gray-100' };
    }
  };

  // 通話時間のフォーマット
  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 日時のフォーマット
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    
    return date.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ローディング表示
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* オペレーターステータス */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-lg font-semibold mb-4">オペレーターステータス</h2>
          
          <div className="flex items-center space-x-4 mb-6">
            <div className={`p-3 rounded-full ${getStatusIcon(operatorStatus).bgColor}`}>
              {getStatusIcon(operatorStatus).icon}
            </div>
            <div>
              <div className={`font-medium ${getStatusIcon(operatorStatus).color}`}>
                {operatorStatus === 'available' ? '対応可能' :
                 operatorStatus === 'busy' ? '通話中' :
                 operatorStatus === 'break' ? '休憩中' : 'オフライン'}
              </div>
              <div className="text-sm text-gray-500">
                オペレーターID: {operatorId}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => changeOperatorStatus('available')}
              disabled={operatorStatus === 'available'}
              className={`py-2 px-3 rounded-md text-sm flex items-center justify-center ${
                operatorStatus === 'available'
                  ? 'bg-green-100 text-green-800 cursor-not-allowed'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              <UserCheck className="w-4 h-4 mr-1" />
              対応可能
            </button>
            
            <button
              onClick={() => openStatusDialog('break')}
              disabled={operatorStatus === 'break'}
              className={`py-2 px-3 rounded-md text-sm flex items-center justify-center ${
                operatorStatus === 'break'
                  ? 'bg-yellow-100 text-yellow-800 cursor-not-allowed'
                  : 'bg-yellow-500 text-white hover:bg-yellow-600'
              }`}
            >
              <Coffee className="w-4 h-4 mr-1" />
              休憩
            </button>
            
            <button
              onClick={() => openStatusDialog('offline')}
              disabled={operatorStatus === 'offline'}
              className={`py-2 px-3 rounded-md text-sm flex items-center justify-center col-span-2 ${
                operatorStatus === 'offline'
                  ? 'bg-gray-100 text-gray-800 cursor-not-allowed'
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
            >
              <PhoneOff className="w-4 h-4 mr-1" />
              オフライン
            </button>
          </div>
        </div>
        
        {/* 今日の統計 */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-lg font-semibold mb-4">今日の対応統計</h2>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{dailyStats.calls}</div>
              <div className="text-sm text-gray-500">対応件数</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{dailyStats.completed}</div>
              <div className="text-sm text-gray-500">完了件数</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{formatDuration(dailyStats.avgDuration)}</div>
              <div className="text-sm text-gray-500">平均通話時間</div>
            </div>
          </div>
        </div>
        
        {/* キュー状況 */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-lg font-semibold mb-4">コールキュー状況</h2>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{queueStats.size}</div>
              <div className="text-sm text-gray-500">待機数</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600">{formatDuration(queueStats.waitTime)}</div>
              <div className="text-sm text-gray-500">最大待ち時間</div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">{queueStats.maxSize}</div>
              <div className="text-sm text-gray-500">最大容量</div>
            </div>
          </div>
          
          {queueStats.size > 0 && (
            <div className="text-sm text-center text-red-500 font-medium">
              {queueStats.size}件の通話が待機中です
            </div>
          )}
        </div>
      </div>
      
      {/* アクティブな通話 */}
      {activeCall && (
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">現在の通話</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <h3 className="font-medium text-gray-700 mb-2">顧客情報</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-sm text-gray-500">名前</div>
                    <div className="font-medium">{activeCall.contactName || '不明'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">電話番号</div>
                    <div className="font-medium">{activeCall.phoneNumber}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500">キャンペーン</div>
                    <div className="font-medium">{activeCall.campaignName}</div>
                  </div>
                  {activeCall.company && (
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500">会社</div>
                      <div className="font-medium">{activeCall.company}</div>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-700 mb-2">通話メモ</h3>
                <textarea
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  rows="5"
                  placeholder="通話内容メモを入力..."
                ></textarea>
              </div>
            </div>
            
            <div>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <h3 className="font-medium text-gray-700 mb-2">通話状態</h3>
                <div className="flex justify-between items-center mb-4">
                  <div className="text-xl font-bold text-blue-600">
                    {operatorStatus === 'busy' ? '通話中' : '着信中'}
                  </div>
                  <div id="call-timer" className="text-lg">
                    00:00
                  </div>
                </div>
                
                {operatorStatus !== 'busy' ? (
                  <div className="flex space-x-2">
                    <button
                      onClick={acceptCall}
                      className="flex-1 bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                    >
                      <Phone className="inline w-5 h-5 mr-1" />
                      応答
                    </button>
                    <button
                      onClick={() => rejectCall(activeCall.callId)}
                      className="flex-1 bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                    >
                      <PhoneOff className="inline w-5 h-5 mr-1" />
                      拒否
                    </button>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">顧客満足度</h3>
                    <div className="flex space-x-2 mb-4">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          onClick={() => setSatisfaction(value)}
                          className={`w-10 h-10 rounded-full focus:outline-none ${
                            satisfaction === value
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={completeCall}
                      className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                    >
                      通話終了
                    </button>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-700 mb-2">スクリプト</h3>
                <div className="text-sm">
                  {activeCall.script || (
                    <div className="italic text-gray-500">
                      こんにちは。{activeCall.company ? activeCall.company + 'の' : ''}
                      {activeCall.contactName || 'お客様'}さん。
                      {activeCall.campaignName}についてご案内しております。
                      お時間よろしいでしょうか？
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* コールキュー */}
      {callQueue.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">待機中の通話 ({callQueue.length}件)</h2>
          
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    待機時間
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    キャンペーン
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    顧客名
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    電話番号
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {callQueue.map((call) => (
                  <tr key={call.id}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-red-600">
                        {formatDuration(call.waitTime)}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.campaignName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.contactName || '不明'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.phoneNumber}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleIncomingCall(call)}
                        disabled={operatorStatus !== 'available' || activeCall}
                        className={`py-1 px-3 rounded text-sm ${
                          operatorStatus === 'available' && !activeCall
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        応答
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* 最近の通話履歴 */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">最近の通話履歴</h2>
          <button
            onClick={fetchCallHistory}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            更新
          </button>
        </div>
        
        {callHistory.length === 0 ? (
          <p className="text-gray-500 text-center py-4">通話履歴がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    日時
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    キャンペーン
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    顧客名
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    電話番号
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    通話時間
                  </th>
                  <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    結果
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {callHistory.map((call) => (
                  <tr key={call.id}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatDateTime(call.startTime)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.campaignName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.contactName || '不明'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {call.phoneNumber}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        call.disposition === 'completed' ? 'bg-green-100 text-green-800' :
                        call.disposition === 'transferred' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {call.disposition === 'completed' ? '完了' :
                         call.disposition === 'transferred' ? '転送' :
                         '中断'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* ステータス変更ダイアログ */}
      {showStatusDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="fixed inset-0 bg-black opacity-50"></div>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-10">
            <h2 className="text-lg font-semibold mb-4">ステータス変更</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                新しいステータス
              </label>
              <div className={`py-2 px-3 rounded-md ${getStatusIcon(operatorStatus).bgColor} ${getStatusIcon(operatorStatus).color}`}>
                {operatorStatus === 'available' ? '対応可能' :
                 operatorStatus === 'busy' ? '通話中' :
                 operatorStatus === 'break' ? '休憩中' : 'オフライン'}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                理由（オプション）
              </label>
              <input
                type="text"
                value={statusChangeReason}
                onChange={(e) => setStatusChangeReason(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                placeholder="ステータス変更の理由..."
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowStatusDialog(false)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                キャンセル
              </button>
              <button
                onClick={() => changeOperatorStatus(operatorStatus)}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                変更
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorDashboard;