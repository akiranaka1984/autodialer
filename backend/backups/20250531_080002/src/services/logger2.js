// backend/src/services/logger.js - 強化版
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.enableConsole = process.env.ENABLE_CONSOLE_LOG !== 'false';
    this.enableFile = process.env.ENABLE_FILE_LOG !== 'false';
    
    // ログレベル定義
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    // ログディレクトリ作成
    this.ensureLogDirectory();
    
    // ログファイルパス
    this.errorLogPath = path.join(this.logDir, 'error.log');
    this.combinedLogPath = path.join(this.logDir, 'combined.log');
    this.dialerLogPath = path.join(this.logDir, 'dialer.log');
    
    // 初期化ログ
    this.info('Logger初期化完了', {
      logLevel: this.logLevel,
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      logDir: this.logDir
    });
  }
  
  ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
        console.log(`ログディレクトリを作成しました: ${this.logDir}`);
      }
    } catch (error) {
      console.error('ログディレクトリ作成エラー:', error);
    }
  }
  
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }
  
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    
    // メタデータを文字列化
    const metaStr = Object.keys(meta).length > 0 
      ? ` ${JSON.stringify(meta, null, 0)}` 
      : '';
    
    // ログレベルのカラーコード（コンソール用）
    const colors = {
      error: '\x1b[31m', // 赤
      warn: '\x1b[33m',  // 黄
      info: '\x1b[36m',  // シアン
      debug: '\x1b[37m'  // 白
    };
    
    const reset = '\x1b[0m';
    const levelUpper = level.toUpperCase().padEnd(5);
    
    // コンソール用（カラー付き）
    const consoleMessage = `${colors[level]}[${timestamp}] ${levelUpper} [PID:${pid}]${reset} ${message}${metaStr}`;
    
    // ファイル用（カラーなし）
    const fileMessage = `[${timestamp}] ${levelUpper} [PID:${pid}] ${message}${metaStr}`;
    
    return { consoleMessage, fileMessage };
  }
  
  writeToFile(logPath, message) {
    if (!this.enableFile) return;
    
    try {
      fs.appendFileSync(logPath, message + '\n', 'utf8');
    } catch (error) {
      // ファイル書き込みエラーはコンソールのみに出力
      console.error('ログファイル書き込みエラー:', error.message);
    }
  }
  
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;
    
    const { consoleMessage, fileMessage } = this.formatMessage(level, message, meta);
    
    // コンソール出力
    if (this.enableConsole) {
      if (level === 'error') {
        console.error(consoleMessage);
      } else if (level === 'warn') {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }
    }
    
    // ファイル出力
    if (this.enableFile) {
      // 全てのログをcombined.logに書き込み
      this.writeToFile(this.combinedLogPath, fileMessage);
      
      // エラーログは専用ファイルにも書き込み
      if (level === 'error') {
        this.writeToFile(this.errorLogPath, fileMessage);
      }
      
      // DialerService関連のログは専用ファイルにも書き込み
      if (message.includes('DialerService') || 
          message.includes('自動発信') || 
          message.includes('キャンペーン') ||
          meta.component === 'dialer') {
        this.writeToFile(this.dialerLogPath, fileMessage);
      }
    }
  }
  
  // 主要なログメソッド
  error(message, meta = {}) {
    // エラーオブジェクトの場合は適切に処理
    if (message instanceof Error) {
      meta = { ...meta, stack: message.stack };
      message = message.message;
    }
    
    this.log('error', message, { ...meta, level: 'ERROR' });
  }
  
  warn(message, meta = {}) {
    this.log('warn', message, { ...meta, level: 'WARN' });
  }
  
  info(message, meta = {}) {
    this.log('info', message, { ...meta, level: 'INFO' });
  }
  
  debug(message, meta = {}) {
    this.log('debug', message, { ...meta, level: 'DEBUG' });
  }
  
  // DialerService専用ログメソッド
  dialer(level, message, meta = {}) {
    this.log(level, `[DIALER] ${message}`, { ...meta, component: 'dialer' });
  }
  
  // SIPService専用ログメソッド
  sip(level, message, meta = {}) {
    this.log(level, `[SIP] ${message}`, { ...meta, component: 'sip' });
  }
  
  // CallService専用ログメソッド
  call(level, message, meta = {}) {
    this.log(level, `[CALL] ${message}`, { ...meta, component: 'call' });
  }
  
  // 通話ログ専用メソッド
  callLog(callId, status, message, meta = {}) {
    this.info(`[CALL:${callId}] ${status} - ${message}`, {
      ...meta,
      callId,
      callStatus: status,
      component: 'call-tracking'
    });
  }
  
  // キャンペーンログ専用メソッド
  campaign(campaignId, action, message, meta = {}) {
    this.info(`[CAMPAIGN:${campaignId}] ${action} - ${message}`, {
      ...meta,
      campaignId,
      campaignAction: action,
      component: 'campaign'
    });
  }
  
  // パフォーマンス測定
  time(label) {
    if (!this.timers) this.timers = new Map();
    this.timers.set(label, Date.now());
    this.debug(`Timer started: ${label}`);
  }
  
  timeEnd(label) {
    if (!this.timers || !this.timers.has(label)) {
      this.warn(`Timer not found: ${label}`);
      return 0;
    }
    
    const startTime = this.timers.get(label);
    const duration = Date.now() - startTime;
    this.timers.delete(label);
    
    this.debug(`Timer completed: ${label} (${duration}ms)`);
    return duration;
  }
  
  // ログローテーション（簡易版）
  async rotateLogFiles() {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const logFiles = [this.combinedLogPath, this.errorLogPath, this.dialerLogPath];
    
    for (const logFile of logFiles) {
      try {
        if (fs.existsSync(logFile)) {
          const stats = fs.statSync(logFile);
          
          if (stats.size > maxFileSize) {
            const backupFile = `${logFile}.${Date.now()}.bak`;
            fs.renameSync(logFile, backupFile);
            this.info(`ログファイルをローテーションしました: ${logFile} -> ${backupFile}`);
          }
        }
      } catch (error) {
        this.error(`ログローテーションエラー: ${logFile}`, error);
      }
    }
  }
  
  // システム情報ログ
  logSystemInfo() {
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      cwd: process.cwd(),
      timestamp: new Date().toISOString()
    };
    
    this.info('システム情報', systemInfo);
  }
  
  // エラー詳細ログ
  logError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      context: context,
      timestamp: new Date().toISOString()
    };
    
    this.error('詳細エラー情報', errorInfo);
  }
  
  // 統計ログ
  logStats(component, stats) {
    this.info(`[STATS:${component}]`, {
      component: 'statistics',
      statsType: component,
      ...stats,
      timestamp: new Date().toISOString()
    });
  }
}

// シングルトンインスタンス
const logger = new Logger();

// 定期的なログローテーション（1時間ごと）
setInterval(() => {
  logger.rotateLogFiles();
}, 60 * 60 * 1000);

// プロセス終了時のクリーンアップ
process.on('exit', () => {
  logger.info('アプリケーション終了');
});

process.on('uncaughtException', (error) => {
  logger.logError(error, { type: 'uncaughtException' });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason,
    promise: promise.toString(),
    type: 'unhandledRejection'
  });
});

module.exports = logger;
