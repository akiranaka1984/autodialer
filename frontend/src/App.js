// frontend/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

// コンポーネントのインポート
import Dashboard from './components/Dashboard';
import TestCall from './components/TestCall';
import CallerIDManagement from './components/CallerIDManagement';
import ContactsUpload from './components/ContactsUpload';
import CampaignList from './components/CampaignList';
import CampaignForm from './components/CampaignForm';
import CampaignDetail from './components/CampaignDetail';
import ReportDashboard from './components/ReportDashboard';
import CallHistory from './components/CallHistory';
import Layout from './components/Layout';
import Login from './components/Login';
import NotFound from './components/NotFound';
import DNCManagement from './components/DNCManagement';
import SystemSettings from './components/SystemSettings';
import OperatorDashboard from './components/OperatorDashboard';

// オペレーターインターフェースのインポート
import OperatorLayout from './components/OperatorInterface/OperatorLayout';
import OperatorMainDashboard from './components/OperatorInterface/OperatorDashboard';
import OperatorHistory from './components/OperatorInterface/OperatorHistory';
import OperatorPerformance from './components/OperatorInterface/OperatorPerformance';

// スタイルシートのインポート
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 認証状態チェック
  useEffect(() => {
    const checkAuth = async () => {
      // ローカルストレージからトークンを取得
      const token = localStorage.getItem('token');
      
      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      
      try {
        // 開発環境ではモックデータを使用
        if (process.env.NODE_ENV === 'development') {
          setIsAuthenticated(true);
          setUser({ 
            name: '開発ユーザー',
            role: 'admin' // または 'operator' でテスト
          });
          setLoading(false);
          return;
        }
        
        // 本番環境では実際のAPIを呼び出す
        const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          // トークンが無効な場合、ログアウト処理
          localStorage.removeItem('token');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('認証チェックエラー:', error);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // ログイン処理
  const handleLogin = (token, user) => {
    localStorage.setItem('token', token);
    setUser(user);
    setIsAuthenticated(true);
  };
  
  // ログアウト処理
  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setIsAuthenticated(false);
  };
  
  // ロード中はローディング表示
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-2">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* 認証が必要なルート */}
        {isAuthenticated ? (
          <>
            {/* 管理者用ルート */}
            {user?.role === 'admin' && (
              <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
                <Route index element={<Dashboard />} />
                <Route path="test-call" element={<TestCall />} />
                <Route path="caller-ids" element={<CallerIDManagement />} />
                <Route path="campaigns" element={<CampaignList />} />
                <Route path="campaigns/new" element={<CampaignForm />} />
                <Route path="campaigns/:campaignId/edit" element={<CampaignForm />} />
                <Route path="campaigns/:id" element={<CampaignDetail />} />
                <Route path="campaigns/:campaignId/contacts/upload" element={<ContactsUpload />} />
                <Route path="reports" element={<ReportDashboard />} />
                <Route path="calls" element={<CallHistory />} />
                <Route path="dnc" element={<DNCManagement />} />
                <Route path="operators" element={<OperatorDashboard />} />
                <Route path="settings" element={<SystemSettings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            )}
            
            {/* オペレーター用ルート */}
            {user?.role === 'operator' && (
              <Route path="/operator" element={<OperatorLayout user={user} onLogout={handleLogout} />}>
                <Route index element={<OperatorMainDashboard />} />
                <Route path="history" element={<OperatorHistory />} />
                <Route path="performance" element={<OperatorPerformance />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            )}
            
            {/* ルート権限によるリダイレクト */}
            <Route path="/" element={
              user?.role === 'operator' ? <Navigate to="/operator" replace /> : <Navigate to="/dashboard" replace />
            } />
            
            {/* 権限のないユーザーのリダイレクト */}
            <Route path="/operator/*" element={
              user?.role === 'operator' ? null : <Navigate to="/" replace />
            } />
            
            <Route path="/*" element={
              user?.role === 'admin' ? null : <Navigate to="/operator" replace />
            } />
          </>
        ) : (
          // 認証されていない場合のルート
          <>
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;