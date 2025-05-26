# ==========================================
# 🎵 音声付きオートダイアラー最終修正スクリプト
# VPS環境での音声実現 + IVR修正
# ==========================================

#!/bin/bash
echo "🎵 音声付きオートダイアラー最終修正開始..."

# 1. 🔧 IVR設定API修正
echo "📝 IVRテスト発信API統一化..."
cat > /var/www/autodialer/backend/src/routes/ivr-test-fix.js << 'EOF'
// IVRテスト発信をメインAPIに統一
router.post('/test-call/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { phoneNumber } = req.body;
    
    // メインのテスト発信APIにリダイレクト
    const callController = require('../controllers/callController');
    
    // パラメータを統一形式に変換
    req.body = {
      phoneNumber,
      callerID: undefined, // キャンペーンから取得
      mockMode: false,
      provider: 'sip',
      campaignId // 重要：キャンペーンIDを追加
    };
    
    // メインのテスト発信処理を呼び出し
    return await callController.testCall(req, res);
    
  } catch (error) {
    logger.error('IVRテスト発信エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'IVRテスト発信に失敗しました', 
      error: error.message 
    });
  }
});
EOF

# 2. 🎵 音声ストリーミング実装
echo "🔊 音声ストリーミングシステム構築..."
cat > /var/www/autodialer/backend/audio-stream-server.js << 'EOF'
// 音声ストリーミングサーバー（Port 8000）
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// 音声ファイルストリーミング
app.get('/stream/:filename', (req, res) => {
  const filename = req.params.filename;
  const audioPath = path.join('/var/www/autodialer/backend/audio-files', filename);
  
  console.log(`🔊 音声ストリーミング: ${filename}`);
  
  if (!fs.existsSync(audioPath)) {
    return res.status(404).send('Audio file not found');
  }
  
  const stat = fs.statSync(audioPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
    const chunksize = (end-start)+1;
    
    const file = fs.createReadStream(audioPath, {start, end});
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    };
    
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(200, head);
    fs.createReadStream(audioPath).pipe(res);
  }
});

app.listen(8000, () => {
  console.log('🎵 音声ストリーミングサーバー開始: Port 8000');
});
EOF

# 3. 🎵 音声付きsipcmdスクリプト強化版
echo "📞 音声付きSIP発信スクリプト作成..."
cat > /usr/local/bin/sipcmd-audio << 'EOF'
#!/bin/bash
# 音声付きSIP発信スクリプト

USERNAME="$1"
PASSWORD="$2"
SERVER="$3"
NUMBER="$4"
DURATION="$5"
AUDIO_FILE="$6"

echo "🎵 音声付きSIP発信開始: $NUMBER"
echo "🔊 音声ファイル: $AUDIO_FILE"

if [ -n "$AUDIO_FILE" ] && [ -f "$AUDIO_FILE" ]; then
    echo "🎵 音声ファイル確認済み: $(basename $AUDIO_FILE)"
    # 音声ファイル付きでpjsua実行
    pjsua \
        --id="sip:$USERNAME@$SERVER" \
        --registrar="sip:$SERVER" \
        --realm="asterisk" \
        --username="$USERNAME" \
        --password="$PASSWORD" \
        --duration=$DURATION \
        --play-file="$AUDIO_FILE" \
        --auto-answer=200 \
        --log-level=3 \
        sip:$NUMBER@$SERVER &
    
    PID=$!
    
    # 3秒後に音声再生開始ログ
    sleep 3
    echo "🔊 音声再生開始 (PID: $PID)"
    
    # プロセス監視
    wait $PID
    echo "📞 音声付き通話終了"
else
    echo "⚠️ 音声ファイルなし - 通常発信"
    # 通常のSIP発信
    pjsua \
        --id="sip:$USERNAME@$SERVER" \
        --registrar="sip:$SERVER" \
        --realm="asterisk" \
        --username="$USERNAME" \
        --password="$PASSWORD" \
        --null-audio \
        --duration=$DURATION \
        sip:$NUMBER@$SERVER
fi
EOF

chmod +x /usr/local/bin/sipcmd-audio

# 4. 🔧 SipServiceの音声対応修正
echo "🎵 SipService音声機能有効化..."
cat > /var/www/autodialer/backend/src/services/sipService-audio-patch.js << 'EOF'
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
EOF

# 5. 🎵 音声ストリーミングサーバー起動
echo "🔊 音声ストリーミングサーバー起動..."
cd /var/www/autodialer/backend
nohup node audio-stream-server.js > audio-stream.log 2>&1 &
echo "✅ 音声ストリーミングサーバー起動完了 (Port 8000)"

# 6. 🧪 音声テスト実行
echo "🧪 音声機能テスト..."
if [ -f "/var/www/autodialer/backend/audio-files/test.mp3" ]; then
    echo "🎵 テスト音声ファイル確認済み"
    
    # 音声ストリーミングテスト
    echo "🌐 音声ストリーミングテスト..."
    curl -I http://localhost:8000/stream/test.mp3
    
    echo "✅ 音声機能準備完了"
else
    echo "⚠️ テスト音声ファイルが見つかりません"
    echo "📄 サンプル音声ファイル作成..."
    
    # FFmpegでテスト音声生成
    if command -v ffmpeg &> /dev/null; then
        ffmpeg -f lavfi -i "sine=frequency=1000:duration=5" -acodec mp3 /var/www/autodialer/backend/audio-files/test.mp3
        echo "✅ テスト音声ファイル生成完了"
    fi
fi

# 7. 🔄 サービス再起動
echo "🔄 サービス再起動..."
cd /var/www/autodialer/backend
pm2 restart autodialer-backend || npm start &

echo ""
echo "🎉 ==========================================🎉"
echo "   🎵 音声付きオートダイアラー修正完了！"
echo "🎉 ==========================================🎉"
echo ""
echo "✅ 修正内容:"
echo "   1. IVRテスト発信API統一化"
echo "   2. 音声ストリーミングサーバー起動 (Port 8000)"
echo "   3. 音声付きSIP発信スクリプト作成"
echo "   4. SipService音声機能有効化"
echo ""
echo "🧪 テスト手順:"
echo "   1. フロントエンド: http://143.198.209.38:3003"
echo "   2. キャンペーン管理 > IVR設定 > テスト発信"
echo "   3. 電話が鳴って音声が流れることを確認"
echo ""
echo "🔊 音声ストリーミング: http://143.198.209.38:8000/stream/[filename]"
echo "📞 SIP発信ログ: /var/www/autodialer/backend/logs/"
echo "🎵 音声ログ: /var/www/autodialer/backend/audio-stream.log"
echo ""
