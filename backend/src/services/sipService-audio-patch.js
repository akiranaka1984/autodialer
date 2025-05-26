// SipService音声機能パッチ
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 音声付き発信メソッドの上書き
async function originateWithAudio(params) {
  console.log(`🎵 音声付きSIP発信: ${params.phoneNumber}`);
  
  const sipAccount = await this.getAvailableSipAccount();
  if (!sipAccount) {
    throw new Error('利用可能なSIPアカウントがありません');
  }
  
  const callId = `sip-audio-${Date.now()}`;
  const formattedNumber = this.formatPhoneNumber(params.phoneNumber);
  
  // キャンペーン音声ファイルを取得
  let primaryAudioFile = null;
  if (params.campaignAudio && params.campaignAudio.length > 0) {
    const welcomeAudio = params.campaignAudio.find(a => a.audio_type === 'welcome');
    if (welcomeAudio && welcomeAudio.path) {
      primaryAudioFile = welcomeAudio.path;
      console.log(`🔊 音声ファイル設定: ${path.basename(primaryAudioFile)}`);
    }
  }
  
  // 音声付きsipcmdを実行
  const args = [
    sipAccount.username,
    sipAccount.password,
    'ito258258.site',
    formattedNumber,
    '30',
    primaryAudioFile || ''
  ];
  
  console.log(`🚀 音声付きSIP発信実行: sipcmd-audio ${args.join(' ')}`);
  
  const sipcmdProcess = spawn('/usr/local/bin/sipcmd-audio', args);
  
  // プロセス出力監視
  sipcmdProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`📞 SIP出力: ${output}`);
    
    if (output.includes('音声再生開始')) {
      console.log('🎵 音声再生確認済み！');
    }
  });
  
  sipcmdProcess.on('close', (code) => {
    console.log(`📞 音声付きSIP発信終了: code=${code}`);
    this.releaseCallResource(callId);
  });
  
  return {
    ActionID: callId,
    Response: 'Success',
    Message: '🎵 音声付きSIP発信が開始されました',
    SipAccount: sipAccount.username,
    provider: 'sip',
    audioEnabled: !!primaryAudioFile
  };
}

module.exports = { originateWithAudio };
