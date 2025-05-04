// frontend/src/components/Layout.js
import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Phone, Users, BarChart2, Settings, LogOut, Menu, X, User, Bell, FileText, History, Ban ,UserCog} from 'lucide-react';

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

 // サイドバーのリンク設定
 const navLinks = [
  { path: '/', label: 'ダッシュボード', icon: <BarChart2 className="h-5 w-5 mr-3" /> },
  { path: '/test-call', label: 'テスト発信', icon: <Phone className="h-5 w-5 mr-3" /> },
  { path: '/caller-ids', label: '発信者番号管理', icon: <Settings className="h-5 w-5 mr-3" /> },
  { path: '/campaigns', label: 'キャンペーン管理', icon: <Users className="h-5 w-5 mr-3" /> },
  { path: '/operators', label: 'オペレーター管理', icon: <UserCog className="h-5 w-5 mr-3" /> },  // 追加
  { path: '/calls', label: '通話履歴', icon: <History className="h-5 w-5 mr-3" /> },
  { path: '/dnc', label: 'DNCリスト', icon: <Ban className="h-5 w-5 mr-3" /> },
  { path: '/reports', label: 'レポート', icon: <FileText className="h-5 w-5 mr-3" /> },
  { path: '/settings', label: 'システム設定', icon: <Settings className="h-5 w-5 mr-3" /> },
];
 
 return (
   <div className="flex h-screen bg-gray-100">
     {/* モバイル向けオーバーレイ */}
     <div 
       className={`${
         sidebarOpen ? 'block' : 'hidden'
       } fixed inset-0 z-20 transition-opacity bg-gray-600 opacity-75 lg:hidden`}
       onClick={toggleSidebar}
       aria-hidden="true"
     ></div>
     
     {/* サイドバー（モバイル対応） */}
     <aside 
       className={`${
         sidebarOpen ? 'translate-x-0' : '-translate-x-full'
       } fixed inset-y-0 left-0 z-30 w-64 transition duration-300 transform bg-gray-800 overflow-y-auto lg:translate-x-0 lg:relative lg:inset-0`}
     >
       <div className="flex items-center justify-between p-4 text-white">
         <div className="flex items-center">
           <Phone className="h-8 w-8 mr-2" />
           <span className="text-lg font-bold">Auto Caller</span>
         </div>
         <button 
           className="lg:hidden focus:outline-none focus:bg-gray-700 rounded p-1"
           onClick={toggleSidebar}
           aria-label="閉じる"
         >
           <X className="h-6 w-6" />
         </button>
       </div>
       
       <nav className="mt-5 px-2">
         {navLinks.map((link) => (
           <Link 
             key={link.path}
             to={link.path}
             className={`${
               (link.path === '/' ? isActive(link.path) : location.pathname.startsWith(link.path)) 
                 ? 'bg-gray-700 text-white' 
                 : 'text-gray-300 hover:bg-gray-700 hover:text-white'
             } flex items-center px-4 py-3 mb-1 rounded-md transition-colors duration-200`}
           >
             {link.icon}
             <span>{link.label}</span>
           </Link>
         ))}
         
         {/* セパレーター */}
         <div className="my-4 border-t border-gray-700"></div>
         
         <button 
           onClick={onLogout}
           className="w-full flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors duration-200"
         >
           <LogOut className="h-5 w-5 mr-3" />
           <span>ログアウト</span>
         </button>
       </nav>
     </aside>
     
     {/* メインコンテンツ */}
     <div className="flex flex-col flex-1 overflow-hidden">
       {/* ヘッダー */}
       <header className="flex items-center justify-between p-4 bg-white shadow z-10">
         <button 
           className="p-1 rounded-md lg:hidden focus:outline-none focus:ring-2 focus:ring-gray-300"
           onClick={toggleSidebar}
           aria-label="メニュー"
         >
           <Menu className="h-6 w-6" />
         </button>
         
         <div className="flex items-center space-x-4 ml-auto">
           <button 
             className="p-1 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
             aria-label="通知"
           >
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
       <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-4">
         <Outlet />
       </main>
     </div>
   </div>
 );
};

export default Layout;