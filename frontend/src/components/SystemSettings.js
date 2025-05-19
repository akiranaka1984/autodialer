// frontend/src/components/SystemSettings.js への修正
import React, { useState } from 'react';
import { Settings, Phone, Server, User, Database, Bell, Music } from 'lucide-react';
import AudioFileManager from './AudioFileManager';

const SystemSettings = () => {
  // タブの状態管理
  const [activeTab, setActiveTab] = useState('general');

  // 各設定タブの内容
  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'audio':
        return <AudioFileManager />;
      case 'server':
        return <ServerSettings />;
      case 'notification':
        return <NotificationSettings />;
      case 'user':
        return <UserSettings />;
      case 'database':
        return <DatabaseSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  // 設定タブの定義
  const tabs = [
    { id: 'general', label: '一般設定', icon: <Settings className="h-5 w-5" /> },
    { id: 'audio', label: '音声ファイル管理', icon: <Music className="h-5 w-5" /> },
    { id: 'server', label: 'サーバー設定', icon: <Server className="h-5 w-5" /> },
    { id: 'notification', label: '通知設定', icon: <Bell className="h-5 w-5" /> },
    { id: 'user', label: 'ユーザー設定', icon: <User className="h-5 w-5" /> },
    { id: 'database', label: 'データベース設定', icon: <Database className="h-5 w-5" /> },
  ];

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">システム設定</h1>

      <div className="flex flex-col md:flex-row bg-white rounded-lg shadow">
        {/* 左側のタブメニュー */}
        <div className="w-full md:w-64 bg-gray-50 rounded-l-lg">
          <ul className="py-2">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-4 py-3 flex items-center space-x-3 ${
                    activeTab === tab.id
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className={activeTab === tab.id ? 'text-blue-500' : 'text-gray-500'}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 右側のタブコンテンツ */}
        <div className="flex-1 p-6">{renderTabContent()}</div>
      </div>
    </div>
  );
};

// 各設定画面のコンポーネント
// 一般設定
const GeneralSettings = () => (
  <div>
    <h2 className="text-xl font-semibold mb-6">一般設定</h2>
    <p className="text-gray-500 mb-4">
      システムの基本設定を管理します。これらの設定はシステム全体に影響します。
    </p>
    
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">システム名</label>
        <input
          type="text"
          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
          defaultValue="Auto Caller"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ロゴ</label>
        <div className="flex items-center">
          <span className="h-12 w-12 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
            <Phone className="h-6 w-6 text-gray-600" />
          </span>
          <button
            type="button"
            className="ml-5 bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            変更
          </button>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">タイムゾーン</label>
        <select
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          defaultValue="Asia/Tokyo"
        >
          <option value="Asia/Tokyo">アジア/東京 (GMT+9:00)</option>
          <option value="America/New_York">アメリカ/ニューヨーク (GMT-5:00)</option>
          <option value="Europe/London">ヨーロッパ/ロンドン (GMT+0:00)</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">言語</label>
        <select
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          defaultValue="ja"
        >
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </div>
      
      <div className="pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  </div>
);

// サーバー設定
const ServerSettings = () => (
  <div>
    <h2 className="text-xl font-semibold mb-6">サーバー設定</h2>
    <p className="text-gray-500 mb-4">
      バックエンドサーバーの設定を管理します。これらの設定はシステムパフォーマンスに影響します。
    </p>
    
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">最大同時通話数</label>
        <input
          type="number"
          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
          defaultValue="10"
          min="1"
          max="100"
        />
        <p className="mt-1 text-sm text-gray-500">
          システム全体の最大同時発信数を設定します。サーバーリソースに合わせて調整してください。
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">発信間隔（秒）</label>
        <input
          type="number"
          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
          defaultValue="3"
          min="1"
          max="60"
        />
        <p className="mt-1 text-sm text-gray-500">
          連続して発信する際の間隔を秒単位で設定します。
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">発信プロバイダ</label>
        <select
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          defaultValue="sip"
        >
          <option value="asterisk">Asterisk</option>
          <option value="sip">SIP</option>
          <option value="auto">自動選択</option>
        </select>
        <p className="mt-1 text-sm text-gray-500">
          デフォルトの発信プロバイダを選択します。
        </p>
      </div>
      
      <div>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="fallback"
              name="fallback"
              type="checkbox"
              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              defaultChecked
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="fallback" className="font-medium text-gray-700">
              フォールバック有効化
            </label>
            <p className="text-gray-500">
              選択したプロバイダで発信できない場合、他のプロバイダを使用します。
            </p>
          </div>
        </div>
      </div>
      
      <div className="pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  </div>
);

// 通知設定
const NotificationSettings = () => (
  <div>
    <h2 className="text-xl font-semibold mb-6">通知設定</h2>
    <p className="text-gray-500 mb-4">
      システムからの通知設定を管理します。
    </p>
    
    <div className="space-y-6">
      <div>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="email-notifications"
              name="email-notifications"
              type="checkbox"
              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              defaultChecked
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="email-notifications" className="font-medium text-gray-700">
              メール通知
            </label>
            <p className="text-gray-500">
              キャンペーン完了時やエラー発生時にメールで通知します。
            </p>
          </div>
        </div>
      </div>
      
      <div>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="browser-notifications"
              name="browser-notifications"
              type="checkbox"
              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              defaultChecked
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="browser-notifications" className="font-medium text-gray-700">
              ブラウザ通知
            </label>
            <p className="text-gray-500">
              アプリケーション使用中にブラウザ通知を表示します。
            </p>
          </div>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">通知メールアドレス</label>
        <input
          type="email"
          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
          placeholder="例: admin@example.com"
        />
      </div>
      
      <div className="pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ユーザー設定
const UserSettings = () => (
  <div>
    <h2 className="text-xl font-semibold mb-6">ユーザー設定</h2>
    <p className="text-gray-500 mb-4">
      ユーザーアカウントと権限の設定を管理します。
    </p>
    
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">セッションタイムアウト（分）</label>
        <input
          type="number"
          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
          defaultValue="30"
          min="5"
          max="120"
        />
        <p className="mt-1 text-sm text-gray-500">
          アクティビティがない場合のセッションタイムアウト時間を分単位で設定します。
        </p>
      </div>
      
      <div>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              id="two-factor"
              name="two-factor"
              type="checkbox"
              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="two-factor" className="font-medium text-gray-700">
              二要素認証を必須にする
            </label>
            <p className="text-gray-500">
              すべてのユーザーに二要素認証を要求します。
            </p>
          </div>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">パスワードポリシー</label>
        <select
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          defaultValue="medium"
        >
          <option value="low">低（最低6文字）</option>
          <option value="medium">中（最低8文字、数字を含む）</option>
          <option value="high">高（最低10文字、数字と特殊文字を含む）</option>
        </select>
      </div>
      
      <div className="pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  </div>
);

// データベース設定
const DatabaseSettings = () => (
  <div>
    <h2 className="text-xl font-semibold mb-6">データベース設定</h2>
    <p className="text-gray-500 mb-4">
      データベース接続とバックアップの設定を管理します。
    </p>
    
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">自動バックアップ</label>
        <select
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          defaultValue="daily"
        >
          <option value="disabled">無効</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">バックアップ保存期間（日）</label>
        <input
          type="number"
          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
          defaultValue="30"
          min="1"
          max="365"
        />
      </div>
      
      <div>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          今すぐバックアップを作成
        </button>
      </div>
      
      <div>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          データベース最適化を実行
        </button>
        <p className="mt-1 text-sm text-gray-500">
          データベースの最適化を実行するとパフォーマンスが向上する場合があります。処理中はシステムが遅くなる可能性があります。
        </p>
      </div>
      
      <div className="pt-5">
        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default SystemSettings;