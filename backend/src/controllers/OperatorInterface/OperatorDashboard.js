import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Coffee, CheckCircle, XCircle, Clock, Mic, MicOff } from 'lucide-react';

const OperatorDashboard = () => {
  const [operatorStatus, setOperatorStatus] = useState('offline');
  const [currentCall, setCurrentCall] = useState(null);
  const [stats, setStats] = useState({
    totalCalls: 0,
    avgDuration: 0,
    satisfaction: 0
  });
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    // WebSocket接続の初期化
    const connectWebSocket = () => {
      const token = localStorage.getItem('token');
      const ws = new WebSocket(`ws://${window.location.host}/ws`);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'authenticate', token }));
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'newCall':
            handleIncomingCall(data.callData);
            break;
          case 'callEnded':
            handleCallEnd();
            break;
          default:
            break;
        }
      };
      
      return ws;
    };

    const ws = connectWebSocket();
    return () => ws.close();
  }, []);

  // 通話時間のタイマー
  useEffect(() => {
    let timer;
    if (currentCall) {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentCall]);

  const handleIncomingCall = (callData) => {
    setCurrentCall(callData);
    setCallDuration(0);
    setOperatorStatus('busy');
  };

  const handleCallEnd = () => {
    setCurrentCall(null);
    setCallDuration(0);
    setOperatorStatus('available');
  };

  const updateStatus = async (newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/operators/status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      setOperatorStatus(newStatus);
    } catch (error) {
      console.error('ステータス更新エラー:', error);
    }
  };

  const handleCall = async (action) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/operators/call/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ callId: currentCall?.id })
      });
      
      if (action === 'end') {
        handleCallEnd();
      }
    } catch (error) {
      console.error('通話操作エラー:', error);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">オペレーターダッシュボード</h1>
        <p className="text-gray-600">ようこそ、オペレーターさん</p>
      </div>

      {/* ステータスコントロール */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">ステータス</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => updateStatus('available')}
            className={`px-4 py-2 rounded flex items-center ${
              operatorStatus === 'available' ? 'bg-green-600 text-white' : 'bg-gray-200'
            }`}
          >
            <CheckCircle className="h-5 w-5 mr-2" />
            対応可能
          </button>
          <button
            onClick={() => updateStatus('break')}
            className={`px-4 py-2 rounded flex items-center ${
              operatorStatus === 'break' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
            }`}
          >
            <Coffee className="h-5 w-5 mr-2" />
            休憩中
          </button>
          <button
            onClick={() => updateStatus('offline')}
            className={`px-4 py-2 rounded flex items-center ${
              operatorStatus === 'offline' ? 'bg-gray-600 text-white' : 'bg-gray-200'
            }`}
          >
            <XCircle className="h-5 w-5 mr-2" />
            オフライン
          </button>
        </div>
      </div>

      {/* 現在の通話 */}
      {currentCall && (
        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">現在の通話</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600">顧客情報</p>
              <p className="font-medium">{currentCall.customerName}</p>
              <p className="text-sm">{currentCall.phoneNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">キャンペーン</p>
              <p className="font-medium">{currentCall.campaignName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">通話時間</p>
              <p className="font-medium text-2xl">{formatDuration(callDuration)}</p>
            </div>
          </div>
          
          <div className="mt-4 flex space-x-4">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`px-4 py-2 rounded flex items-center ${
                isMuted ? 'bg-red-600 text-white' : 'bg-gray-200'
              }`}
            >
              {isMuted ? (
                <MicOff className="h-5 w-5 mr-2" />
              ) : (
                <Mic className="h-5 w-5 mr-2" />
              )}
              {isMuted ? 'ミュート中' : 'ミュート'}
            </button>
            <button
              onClick={() => handleCall('end')}
              className="px-4 py-2 bg-red-600 text-white rounded flex items-center"
            >
              <PhoneOff className="h-5 w-5 mr-2" />
              通話終了
            </button>
          </div>
        </div>
      )}

      {/* 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">本日の対応数</h3>
          <p className="text-3xl font-bold">{stats.totalCalls}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">平均通話時間</h3>
          <p className="text-3xl font-bold">{stats.avgDuration}分</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-2">満足度評価</h3>
          <p className="text-3xl font-bold">{stats.satisfaction}/5</p>
        </div>
      </div>

      {/* スクリプト表示 */}
      {currentCall && (
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">通話スクリプト</h2>
          <div className="prose max-w-none">
            <p>{currentCall.script}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorDashboard;