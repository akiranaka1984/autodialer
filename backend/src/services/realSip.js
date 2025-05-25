const { spawn } = require('child_process');
const logger = require('./logger');

class RealSipService {
  async makeCall(username, password, server, targetNumber, duration = 30) {
    logger.info(`🔥 実SIP発信開始: ${targetNumber}`);
    
    return new Promise((resolve, reject) => {
      // 実際のsipcmd実行
      const sipProcess = spawn('/usr/local/bin/sipcmd', [
        username, password, server, targetNumber, duration
      ]);
      
      const callId = `real-sip-${Date.now()}`;
      
      sipProcess.on('close', (code) => {
        logger.info(`✅ 実SIP発信完了: ${callId}, code=${code}`);
        resolve({
          ActionID: callId,
          Response: 'Success',
          Message: '実SIP発信実行',
          provider: 'real-sip'
        });
      });
      
      sipProcess.on('error', (error) => {
        logger.error(`❌ SIP発信エラー: ${error.message}`);
        reject(error);
      });
    });
  }
}

module.exports = new RealSipService();
