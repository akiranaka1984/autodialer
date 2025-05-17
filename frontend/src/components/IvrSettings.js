// frontend/src/components/IvrSettings.js
import React, { useState, useEffect } from 'react';
import { Settings, Save, Phone, Play, Code, RefreshCw } from 'lucide-react';
import AudioManagement from './AudioManagement';

const IvrSettings = ({ campaignId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ivrConfig, setIvrConfig] = useState({
    welcomeMessage: '',
    menuOptions: '',
    transferExtension: '1',
    dncOption: '9',
    maxRetries: 3,
    timeoutSeconds: 10,
    goodbyeMessage: ''
  });
  const [ivrScript, setIvrScript] = useState('');
  const [mode, setMode] = useState('visual'); // visual or script
  const [showAudioManager, setShowAudioManager] = useState(false);
  const [generateStatus, setGenerateStatus] = useState('idle'); // idle, generating, success, error
  
  // 環境変数からAPIのベースURLを取得
  const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
  
  // 初期ロード時にキャンペーンのIVR設定を取得
  useEffect(() => {
    if (campaignId) {
      fetchIvrSettings();
    } else {
      setLoading(false);
    }
  }, [campaignId]);
  
  // キャンペーンのIVR設定を取得
  const fetchIvrSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モックデータを設定
        setTimeout(() => {
          const mockConfig = {
            welcomeMessage: 'お電話ありがとうございます。当社の自動音声案内システムです。',
            menuOptions: '詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。',
            transferExtension: '1',
            dncOption: '9',
            maxRetries: 3,
            timeoutSeconds: 10,
            goodbyeMessage: 'お電話ありがとうございました。'
          };
          
          const mockScript = `; IVR Script for Campaign: Campaign Name (ID: ${campaignId})

[autodialer-campaign-${campaignId}]
exten => s,1,Answer()
  same => n,Wait(1)
  same => n,Playback(custom/welcome)
  same => n,Playback(custom/menu)
  same => n,WaitExten(10)

exten => 1,1,NoOp(Operator transfer requested)
  same => n,Set(CAMPAIGN_ID=${campaignId})
  same => n,Set(KEYPRESS=1)
  same => n,Goto(operator-transfer,s,1)

exten => 9,1,NoOp(DNC requested)
  same => n,Set(CAMPAIGN_ID=${campaignId})
  same => n,Set(KEYPRESS=9)
  same => n,Playback(custom/dnc-confirmation)
  same => n,Hangup()

exten => t,1,NoOp(Timeout occurred)
  same => n,Playback(custom/goodbye)
  same => n,Hangup()

exten => i,1,NoOp(Invalid input)
  same => n,Playback(custom/invalid-option)
  same => n,Goto(s,4)

exten => h,1,NoOp(Hangup handler)
  same => n,System(curl -X POST http://localhost:5000/api/callback/call-end -d "callId=${campaignId}-\${UNIQUEID}&duration=\${ANSWEREDTIME}&disposition=\${DIALSTATUS}&keypress=\${KEYPRESS}")`;
          
          setIvrConfig(mockConfig);
          setIvrScript(mockScript);
          setLoading(false);
        }, 700);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/ivr`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('IVR設定の取得に失敗しました');
      }
      
      const data = await response.json();
      setIvrConfig(data.config);
      setIvrScript(data.script);
      setError(null);
    } catch (err) {
      console.error('API呼び出しエラー:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // 設定変更ハンドラ
  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setIvrConfig(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // スクリプト編集ハンドラ
  const handleScriptChange = (e) => {
    setIvrScript(e.target.value);
  };
  
  // 設定の保存
  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モック処理（何もしない）
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/ivr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          config: ivrConfig,
          script: mode === 'script' ? ivrScript : null
        })
      });
      
      if (!response.ok) {
        throw new Error('IVR設定の保存に失敗しました');
      }
      
      // 成功したら設定を更新
      const data = await response.json();
      setIvrConfig(data.config);
      setIvrScript(data.script);
      setError(null);
    } catch (err) {
      console.error('設定保存エラー:', err);
      setError(err.message);
    }
  };
  
  // IVRスクリプトを生成
  const generateIvrScript = async () => {
    setGenerateStatus('generating');
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モック処理
        setTimeout(() => {
          const mockScript = `; Auto-generated IVR Script for Campaign: Campaign Name (ID: ${campaignId})

[autodialer-campaign-${campaignId}]
exten => s,1,Answer()
  same => n,Wait(1)
  same => n,Playback(custom/welcome)
  same => n,Playback(custom/menu)
  same => n,WaitExten(${ivrConfig.timeoutSeconds})

exten => ${ivrConfig.transferExtension},1,NoOp(Operator transfer requested)
  same => n,Set(CAMPAIGN_ID=${campaignId})
  same => n,Set(KEYPRESS=${ivrConfig.transferExtension})
  same => n,Goto(operator-transfer,s,1)

exten => ${ivrConfig.dncOption},1,NoOp(DNC requested)
  same => n,Set(CAMPAIGN_ID=${campaignId})
  same => n,Set(KEYPRESS=${ivrConfig.dncOption})
  same => n,Playback(custom/dnc-confirmation)
  same => n,Hangup()

exten => t,1,NoOp(Timeout occurred)
  same => n,Playback(custom/goodbye)
  same => n,Hangup()

exten => i,1,NoOp(Invalid input)
  same => n,Playback(custom/invalid-option)
  same => n,Goto(s,4)

exten => h,1,NoOp(Hangup handler)
  same => n,System(curl -X POST http://localhost:5000/api/callback/call-end -d "callId=${campaignId}-\${UNIQUEID}&duration=\${ANSWEREDTIME}&disposition=\${DIALSTATUS}&keypress=\${KEYPRESS}")`;
          
          setIvrScript(mockScript);
          setGenerateStatus('success');
          setMode('script');
        }, 1000);
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/generate-ivr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          config: ivrConfig
        })
      });
      
      if (!response.ok) {
        throw new Error('IVRスクリプトの生成に失敗しました');
      }
      
      const data = await response.json();
      setIvrScript(data.script);
      setGenerateStatus('success');
      setMode('script');
      setError(null);
    } catch (err) {
      console.error('スクリプト生成エラー:', err);
      setError(err.message);
      setGenerateStatus('error');
    }
  };
  
  // IVRスクリプトをデプロイ
  const deployIvrScript = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // 開発環境でモックデータを使用するオプション
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        // モック処理（何もしない）
        return;
      }
      
      const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/deploy-ivr`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('IVRスクリプトのデプロイに失敗しました');
      }
      
      alert('IVRスクリプトがデプロイされました');
    } catch (err) {
      console.error('デプロイエラー:', err);
      setError(err.message);
    }
  };
  
  // モード切り替え
  const toggleMode = () => {
    setMode(prev => prev === 'visual' ? 'script' : 'visual');
  };
  
  if (loading) {
    return <div className="text-center p-4">読み込み中...</div>;
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">IVR設定</h2>
        <div className="flex space-x-2">
          <button
            onClick={toggleMode}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            {mode === 'visual' ? 
              <><Code className="h-5 w-5 mr-2 inline-block" />スクリプト表示</> : 
              <><Settings className="h-5 w-5 mr-2 inline-block" />ビジュアル設定</>}
          </button>
          
          <button
            onClick={() => setShowAudioManager(!showAudioManager)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            <Play className="h-5 w-5 mr-2 inline-block" />
            音声管理
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {/* 音声管理コンポーネント */}
      {showAudioManager && (
        <div className="mb-6">
          <AudioManagement campaignId={campaignId} />
        </div>
      )}
      
      {/* ビジュアル設定モード */}
      {mode === 'visual' && (
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                初期挨拶メッセージ
              </label>
              <textarea
                name="welcomeMessage"
                value={ivrConfig.welcomeMessage}
                onChange={handleConfigChange}
                rows={3}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="例: お電話ありがとうございます。当社の自動音声案内システムです。"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メニュー案内
              </label>
              <textarea
                name="menuOptions"
                value={ivrConfig.menuOptions}
                onChange={handleConfigChange}
                rows={3}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="例: 詳しい情報をお聞きになりたい場合は1を、電話帳から削除をご希望の場合は9を押してください。"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                オペレーター転送キー
              </label>
              <input
                type="text"
                name="transferExtension"
                value={ivrConfig.transferExtension}
                onChange={handleConfigChange}
                maxLength={1}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="1"
              />
              <p className="mt-1 text-sm text-gray-500">オペレーター転送する際に押すキー（通常は1）</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                DNCオプションキー
              </label>
              <input
                type="text"
                name="dncOption"
                value={ivrConfig.dncOption}
                onChange={handleConfigChange}
                maxLength={1}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="9"
              />
              <p className="mt-1 text-sm text-gray-500">発信リストから削除する際に押すキー（通常は9）</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                キー入力最大試行回数
              </label>
              <input
                type="number"
                name="maxRetries"
                value={ivrConfig.maxRetries}
                onChange={handleConfigChange}
                min={1}
                max={5}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                タイムアウト時間（秒）
              </label>
              <input
                type="number"
                name="timeoutSeconds"
                value={ivrConfig.timeoutSeconds}
                onChange={handleConfigChange}
                min={3}
                max={30}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                終了メッセージ
              </label>
              <textarea
                name="goodbyeMessage"
                value={ivrConfig.goodbyeMessage}
                onChange={handleConfigChange}
                rows={2}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="例: お電話ありがとうございました。"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <button
              onClick={generateIvrScript}
              className={`px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center ${
                generateStatus === 'generating' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={generateStatus === 'generating'}
            >
              <RefreshCw className={`h-5 w-5 mr-2 ${generateStatus === 'generating' ? 'animate-spin' : ''}`} />
              {generateStatus === 'generating' ? 'スクリプト生成中...' : 'IVRスクリプトを生成'}
            </button>
            
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Save className="h-5 w-5 mr-2" />
              設定を保存
            </button>
          </div>
        </div>
      )}
      
      {/* スクリプト表示/編集モード */}
      {mode === 'script' && (
        <div className="mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Asteriskダイヤルプランスクリプト
            </label>
            <textarea
              value={ivrScript}
              onChange={handleScriptChange}
              rows={15}
              className="font-mono text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full border-gray-300 rounded-md"
            />
            <p className="mt-1 text-sm text-gray-500">
              注意: 手動でスクリプトを編集する場合は、Asteriskのダイヤルプラン構文に注意してください。
            </p>
          </div>
          
          <div className="flex justify-end space-x-2">
            <button
              onClick={deployIvrScript}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 flex items-center"
            >
              <Phone className="h-5 w-5 mr-2" />
              デプロイ
            </button>
            
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Save className="h-5 w-5 mr-2" />
              スクリプトを保存
            </button>
          </div>
        </div>
      )}
      
      {/* IVRフロー図 */}
      <div className="border rounded-md p-4 bg-gray-50">
        <h3 className="font-medium mb-2">IVRフロー</h3>
        <div className="flex flex-col items-center">
          <div className="py-2 px-4 bg-blue-100 border border-blue-300 rounded-md mb-2 text-center">
            着信応答
          </div>
          <div className="w-0.5 h-6 bg-gray-400"></div>
          <div className="py-2 px-4 bg-green-100 border border-green-300 rounded-md mb-2 text-center w-48">
            初期挨拶再生
          </div>
          <div className="w-0.5 h-6 bg-gray-400"></div>
          <div className="py-2 px-4 bg-green-100 border border-green-300 rounded-md mb-2 text-center w-48">
            メニュー案内再生
          </div>
          <div className="w-0.5 h-6 bg-gray-400"></div>
          <div className="py-2 px-4 bg-yellow-100 border border-yellow-300 rounded-md mb-2 text-center">
            キー入力待機（{ivrConfig.timeoutSeconds}秒）
          </div>
          <div className="w-64 h-0.5 bg-gray-400"></div>
          <div className="flex justify-between w-64 mb-2">
            <div className="w-0.5 h-6 bg-gray-400"></div>
            <div className="w-0.5 h-6 bg-gray-400"></div>
            <div className="w-0.5 h-6 bg-gray-400"></div>
          </div>
          <div className="flex justify-between w-64 mb-6">
            <div className="py-2 px-3 bg-purple-100 border border-purple-300 rounded-md text-center text-sm">
              1キー<br/>オペレーター
            </div>
            <div className="py-2 px-3 bg-red-100 border border-red-300 rounded-md text-center text-sm">
              9キー<br/>DNC追加
            </div>
            <div className="py-2 px-3 bg-gray-100 border border-gray-300 rounded-md text-center text-sm">
              タイムアウト
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IvrSettings;