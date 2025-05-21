// frontend/src/components/CampaignList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Edit, Trash2, Play, Pause, Check, X, Plus, AlertCircle, Loader, Eye } from 'lucide-react';

// 削除ボタンコンポーネント
const DeleteButton = ({ campaign, onDelete, isDisabled, isLoading }) => {
  const handleClick = async () => {
    if (isDisabled || isLoading) return;
    onDelete(campaign.id);
  };

  const isActive = campaign.status === 'active';
  const buttonDisabled = isDisabled || isLoading || isActive;
  
  return (
    <button
      onClick={handleClick}
      disabled={buttonDisabled}
      title={isActive ? '実行中のキャンペーンは削除できません' : '削除'}
      className={`${
        buttonDisabled
          ? 'text-gray-400 cursor-not-allowed'
          : 'text-red-600 hover:text-red-900'
      }`}
      data-campaign-id={campaign.id}
    >
      {isLoading ? (
        <Loader className="h-5 w-5 animate-spin" />
      ) : (
        <Trash2 className="h-5 w-5" />
      )}
    </button>
  );
};

const CampaignList = () => {
 const [campaigns, setCampaigns] = useState([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);
 const [actionInProgress, setActionInProgress] = useState(null);
 const [message, setMessage] = useState(null);


// キャンペーン一覧を取得する関数を定義
const fetchCampaigns = async () => {
  try {
    setLoading(true);
    const token = localStorage.getItem('token');
    
    // 環境変数からAPIのベースURLを取得（デフォルトは'/api'）
    const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
    
    console.log(`APIからキャンペーン一覧を取得: ${apiBaseUrl}/campaigns`);
    
    // 常にAPIを呼び出す
    const response = await fetch(`${apiBaseUrl}/campaigns`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate' // キャッシュを無効化
      }
    });
    
    if (!response.ok) {
      throw new Error(`キャンペーン一覧の取得に失敗しました (${response.status})`);
    }
    
    const data = await response.json();
    console.log('キャンペーン一覧を取得しました:', data.length, '件');
    
    setCampaigns(data);
  } catch (error) {
    console.error('キャンペーン一覧取得エラー:', error);
    setError(error.message);
  } finally {
    setLoading(false);
  }
};

 // 初回マウント時にキャンペーン一覧を取得
 useEffect(() => {
   fetchCampaigns();
 }, []);
 
 // キャンペーンのステータスを変更
 const handleStatusChange = async (campaignId, newStatus) => {
   setActionInProgress(campaignId);
   setMessage(null);
   
   try {
     const token = localStorage.getItem('token');
     
     // 開発環境ではモックデータを使用
     if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
       // 処理中のシミュレーション
       await new Promise(resolve => setTimeout(resolve, 1000));
       
       // キャンペーンのステータスを更新
       setCampaigns(campaigns.map(campaign => 
         campaign.id === campaignId ? { ...campaign, status: newStatus } : campaign
       ));
       
       setMessage({
         type: 'success',
         text: `キャンペーンのステータスを${
           newStatus === 'active' ? '実行中' : 
           newStatus === 'paused' ? '一時停止' : 
           newStatus === 'completed' ? '完了' : newStatus
         }に変更しました`
       });
       
       return;
     }
     
     // 環境変数からAPIのベースURLを取得
     const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
     
     // 本番環境では実際のAPIを呼び出す
     const response = await fetch(`${apiBaseUrl}/campaigns/${campaignId}/status`, {
       method: 'PATCH',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token}`
       },
       body: JSON.stringify({ status: newStatus })
     });
     
     if (!response.ok) {
       const errorData = await response.json();
       throw new Error(errorData.message || 'ステータス変更に失敗しました');
     }
     
     // キャンペーン一覧を更新
     setCampaigns(campaigns.map(campaign => 
       campaign.id === campaignId ? { ...campaign, status: newStatus } : campaign
     ));
     
     setMessage({
       type: 'success',
       text: `キャンペーンのステータスを${
         newStatus === 'active' ? '実行中' : 
         newStatus === 'paused' ? '一時停止' : 
         newStatus === 'completed' ? '完了' : newStatus
       }に変更しました`
     });
   } catch (error) {
     setMessage({
       type: 'error',
       text: error.message
     });
   } finally {
     setActionInProgress(null);
   }
 };
 
 // キャンペーンの削除
 const handleDeleteCampaign = async (id) => {
   // 削除前に確認
   if (!window.confirm('このキャンペーンを削除してもよろしいですか？')) {
     return;
   }
   
   // 削除中のUIを表示
   setActionInProgress(id);
   setMessage(null);
   
   try {
     // 環境変数からAPIのベースURLを取得
     const apiBaseUrl = process.env.REACT_APP_API_URL || '/api';
     console.log(`削除リクエストURL: ${apiBaseUrl}/campaigns/${id}`);
     
     const token = localStorage.getItem('token');
     
     // 開発環境の場合はモック処理
     if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_USE_MOCK_DATA === 'true') {
       // 処理中のシミュレーション
       await new Promise(resolve => setTimeout(resolve, 1000));
       
       // 現在のキャンペーン配列からターゲットIDを除外
       setCampaigns(prevCampaigns => 
         prevCampaigns.filter(campaign => campaign.id !== id)
       );
       
       setMessage({ type: 'success', text: 'キャンペーンが削除されました' });
       setActionInProgress(null);
       return;
     }
     
     // 本番環境またはモックを使用しない開発環境では実際にAPIを呼び出す
     const response = await fetch(`${apiBaseUrl}/campaigns/${id}`, {
       method: 'DELETE',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       }
     });
     
     // レスポンスの詳細をログ出力（デバッグ用）
     console.log(`削除レスポンスステータス: ${response.status}`);
     
     // レスポンスJSONを取得（エラーメッセージなどの詳細情報を得るため）
     let responseData;
     try {
       responseData = await response.json();
       console.log('削除レスポンスデータ:', responseData);
     } catch (jsonError) {
       console.warn('JSONパースエラー:', jsonError);
       // JSONパースエラーは致命的ではないので続行
     }
     
     // 正常なステータスコードかどうかチェック
     if (!response.ok) {
       throw new Error(responseData?.message || `削除に失敗しました (${response.status})`);
     }
     
     // キャンペーン一覧から削除されたキャンペーンを除外して状態を更新
     setCampaigns(prevCampaigns => 
       prevCampaigns.filter(campaign => campaign.id !== id)
     );
     
     // 成功メッセージを設定
     setMessage({ 
       type: 'success', 
       text: responseData?.message || 'キャンペーンが削除されました' 
     });
   } catch (error) {
     console.error('削除エラー:', error);
     
     // エラーメッセージを設定
     setMessage({ 
       type: 'error', 
       text: `削除に失敗しました: ${error.message}` 
     });
   } finally {
     // 処理完了時に進行中フラグを解除
     setActionInProgress(null);
   }
 };
 
 // キャンペーンのステータスに基づいたバッジを表示
 const CampaignStatusBadge = ({ status }) => {
   let color = 'bg-gray-100 text-gray-800';
   
   switch (status) {
     case 'active':
       color = 'bg-green-100 text-green-800';
       break;
     case 'paused':
       color = 'bg-yellow-100 text-yellow-800';
       break;
     case 'draft':
       color = 'bg-blue-100 text-blue-800';
       break;
     case 'completed':
       color = 'bg-gray-100 text-gray-800';
       break;
   }
   
   return (
     <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
       {status === 'active' ? '実行中' : 
        status === 'paused' ? '一時停止' : 
        status === 'draft' ? '下書き' : '完了'}
     </span>
   );
 };
 
 // 日付のフォーマット
 const formatDate = (dateString) => {
   if (!dateString) return '';
   
   const date = new Date(dateString);
   return date.toLocaleString('ja-JP', {
     year: 'numeric',
     month: '2-digit',
     day: '2-digit',
     hour: '2-digit',
     minute: '2-digit'
   });
 };
 
 if (loading) {
   return (
     <div className="flex items-center justify-center h-64">
       <div className="flex flex-col items-center">
         <Loader className="h-8 w-8 text-blue-500 animate-spin" />
         <span className="mt-2 text-gray-600">読み込み中...</span>
       </div>
     </div>
   );
 }
 
 return (
   <div className="p-4">
     <div className="flex justify-between items-center mb-6">
       <h1 className="text-2xl font-bold">キャンペーン管理</h1>
       
       <Link
         to="/campaigns/new"
         className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
       >
         <Plus className="h-5 w-5 mr-1" />
         新規キャンペーン
       </Link>
     </div>
     
     {/* メッセージ表示 */}
     {message && (
       <div className={`p-4 mb-6 rounded-md ${
         message.type === 'success' ? 'bg-green-50 text-green-800 border-l-4 border-green-500' :
         'bg-red-50 text-red-800 border-l-4 border-red-500'
       }`}>
         <div className="flex">
           {message.type === 'success' ? (
             <Check className="h-5 w-5 mr-2" />
           ) : (
             <AlertCircle className="h-5 w-5 mr-2" />
           )}
           <p>{message.text}</p>
         </div>
       </div>
     )}
     
     {error && (
       <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 mb-6">
         <div className="flex">
           <AlertCircle className="h-5 w-5 mr-2" />
           <p>{error}</p>
         </div>
       </div>
     )}
     
     {/* キャンペーン一覧 */}
     {campaigns.length === 0 ? (
       <div className="bg-white shadow rounded-lg p-8 text-center">
         <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
         <h3 className="text-lg font-medium text-gray-900 mb-2">キャンペーンがありません</h3>
         <p className="text-gray-500 mb-6">
           新しいキャンペーンを作成して、自動発信を始めましょう。
         </p>
         <Link
           to="/campaigns/new"
           className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
         >
           <Plus className="h-5 w-5 mr-1" />
           キャンペーンを作成
         </Link>
       </div>
     ) : (
       <div className="overflow-x-auto">
         <table className="min-w-full bg-white shadow rounded-lg overflow-hidden">
           <thead className="bg-gray-50">
             <tr>
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 キャンペーン名
               </th>
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 ステータス
               </th>
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 発信者番号
               </th>
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 進捗
               </th>
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                 作成日時
               </th>
               <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                 操作
               </th>
             </tr>
           </thead>
           <tbody className="divide-y divide-gray-200">
             {campaigns.map((campaign) => (
               <tr key={campaign.id}>
                 <td className="px-6 py-4 whitespace-nowrap">
                   <div className="text-sm font-medium text-gray-900">{campaign.name}</div>
                   <div className="text-sm text-gray-500">{campaign.description}</div>
                 </td>
                 <td className="px-6 py-4 whitespace-nowrap">
                   <CampaignStatusBadge status={campaign.status} />
                 </td>
                 <td className="px-6 py-4 whitespace-nowrap">
                   <div className="text-sm text-gray-900">{campaign.caller_id_number}</div>
                   <div className="text-sm text-gray-500">{campaign.caller_id_description}</div>
                 </td>
                 <td className="px-6 py-4 whitespace-nowrap">
                   <div className="w-full bg-gray-200 rounded-full h-2.5">
                     <div 
                       className="bg-blue-600 h-2.5 rounded-full" 
                       style={{ width: `${campaign.progress || 0}%` }}
                     ></div>
                   </div>
                   <div className="text-xs text-gray-500 mt-1">
                     {campaign.completed_calls || 0} / {campaign.contact_count || 0} 件
                     ({campaign.progress || 0}%)
                   </div>
                 </td>
                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                   {formatDate(campaign.created_at)}
                 </td>
                 <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                   <div className="flex justify-end items-center space-x-2">
                     {campaign.status === 'draft' && (
                       <button
                         onClick={() => handleStatusChange(campaign.id, 'active')}
                         disabled={actionInProgress === campaign.id}
                         title="開始"
                         className="text-green-600 hover:text-green-900"
                       >
                         {actionInProgress === campaign.id ? (
                           <Loader className="h-5 w-5 animate-spin" />
                         ) : (
                           <Play className="h-5 w-5" />
                         )}
                       </button>
                     )}
                     
                     {campaign.status === 'active' && (
                       <button
                         onClick={() => handleStatusChange(campaign.id, 'paused')}
                         disabled={actionInProgress === campaign.id}
                         title="一時停止"
                         className="text-yellow-600 hover:text-yellow-900"
                       >
                         {actionInProgress === campaign.id ? (
                           <Loader className="h-5 w-5 animate-spin" />
                         ) : (
                           <Pause className="h-5 w-5" />
                         )}
                       </button>
                     )}
                     
                     {campaign.status === 'paused' && (
                       <button
                         onClick={() => handleStatusChange(campaign.id, 'active')}
                         disabled={actionInProgress === campaign.id}
                         title="再開"
                         className="text-green-600 hover:text-green-900"
                       >
                         {actionInProgress === campaign.id ? (
                           <Loader className="h-5 w-5 animate-spin" />
                         ) : (
                           <Play className="h-5 w-5" />
                         )}
                       </button>
                     )}
                     
                     <Link
                       to={`/campaigns/${campaign.id}`}
                       className="text-blue-600 hover:text-blue-900"
                       title="詳細"
                     >
                       <Eye className="h-5 w-5" />
                     </Link>
                     
                     <Link
                       to={`/campaigns/${campaign.id}/edit`}
                       className="text-indigo-600 hover:text-indigo-900"
                       title="編集"
                     >
                       <Edit className="h-5 w-5" />
                     </Link>
                     
                     {/* 削除ボタンをコンポーネントに置き換え */}
                     <DeleteButton 
                       campaign={campaign}
                       onDelete={handleDeleteCampaign}
                       isDisabled={false}
                       isLoading={actionInProgress === campaign.id}
                     />
                   </div>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
     )}
   </div>
 );
};

export default CampaignList;