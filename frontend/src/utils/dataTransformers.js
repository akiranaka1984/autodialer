// frontend/src/utils/dataTransformers.js

// APIレスポンスを正規化するユーティリティ関数
export const normalizeChannelData = (channel) => {
  if (!channel) return null;
  
  return {
    ...channel,
    // nullや未定義の値に対してデフォルト値を設定
    channel_type: channel.channel_type || 'both',
    status: channel.status || 'available',
    last_used: channel.last_used || null
  };
};

// チャンネルデータの配列を正規化
export const normalizeChannels = (channels) => {
  if (!Array.isArray(channels)) return [];
  return channels.map(normalizeChannelData);
};