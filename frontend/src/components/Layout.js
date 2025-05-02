// frontend/src/components/Layout.js
import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Phone, Users, BarChart2, Settings, LogOut, Menu, X, User, Bell } from 'lucide-react';

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  
  // サイドバーのトグル
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };
  
  // 現在のパスがアクティブかどうかをチェック
  const isActive = (path) => {
    return location.pathname === path;
  };
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* サイドバー（モバイル対応） */}
      <aside 
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-30 w-64 transition duration-300 transform bg-gray-800 md:relative md:translate-x-0`}
      >
        <div className="flex items-center justify-between p-4 text-white">
          <div className="flex items-center">
            <Phone className="h-8 w-8 mr-2" />
            <span className="text-lg font-bold">Auto Caller</span>
          </div>
          <button className="md:hidden" onClick={toggleSidebar}>
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <nav className="mt-5">
          <Link 
            to="/"
            className={`${
              isActive('/') ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
            } flex items-center px-4 py-3 transition-colors`}
          >
            <BarChart2 className="h-5 w-5 mr-3" />
            <span>ダッシュボード</span>
          </Link>
          
          <Link 
            to="/test-call"
            className={`${
              isActive('/test-call') ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
            } flex items-center px-4 py-3 transition-colors`}
          >
            <Phone className="h-5 w-5 mr-3" />
            <span>テスト発信</span>
          </Link>
          
          <Link 
            to="/caller-ids"
            className={`${
              isActive('/caller-ids') ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
            } flex items-center px-4 py-3 transition-colors`}
          >
            <Settings className="h-5 w-5 mr-3" />
            <span>発信者番号管理</span>
          </Link>
          
          <div className="px-4 py-3 text-xs text-gray-400 uppercase">
            キャンペーン
          </div>
          
          <Link 
            to="/campaigns"
            className={`${
              location.pathname.startsWith('/campaigns') ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
            } flex items-center px-4 py-3 transition-colors`}
          >
            <Users className="h-5 w-5 mr-3" />
            <span>キャンペーン管理</span>
          </Link>
          
          {/* セパレーター */}
          <div className="my-4 border-t border-gray-700"></div>
          
          <button 
            onClick={onLogout}
            className="w-full flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <LogOut className="h-5 w-5 mr-3" />
            <span>ログアウト</span>
          </button>
        </nav>
      </aside>
      
      {/* メインコンテンツ */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* ヘッダー */}
        <header className="flex items-center justify-between p-4 bg-white shadow">
          <button className="md:hidden" onClick={toggleSidebar}>
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
            <button className="p-1 rounded-full hover:bg-gray-200">
              <Bell className="h-5 w-5" />
            </button>
            
            <div className="flex items-center">
              <div className="p-2 rounded-full bg-gray-200">
                <User className="h-5 w-5" />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:block">
                {user ? user.name : 'ユーザー'}
              </span>
            </div>
          </div>
        </header>
        
        {/* メインコンテンツエリア */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;