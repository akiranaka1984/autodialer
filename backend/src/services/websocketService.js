const WebSocket = require('ws');
const logger = require('./logger');
const jwt = require('jsonwebtoken');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // クライアントID => {ws, user, campaigns}
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });
    
    this.wss.on('connection', (ws, req) => {
      const clientId = Math.random().toString(36).substring(7);
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          
          switch (data.type) {
            case 'authenticate':
              await this.handleAuthentication(ws, clientId, data.token);
              break;
            
            case 'subscribe':
              this.handleSubscribe(clientId, data.campaignId);
              break;
            
            case 'unsubscribe':
              this.handleUnsubscribe(clientId, data.campaignId);
              break;
          }
        } catch (error) {
          logger.error('WebSocketメッセージ処理エラー:', error);
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`クライアント切断: ${clientId}`);
      });
      
      ws.on('error', (error) => {
        logger.error(`WebSocketエラー: ${clientId}`, error);
      });
    });
  }

  async handleAuthentication(ws, clientId, token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      
      this.clients.set(clientId, {
        ws,
        user: decoded,
        campaigns: new Set()
      });
      
      ws.send(JSON.stringify({
        type: 'authenticated',
        clientId,
        message: '認証成功'
      }));
      
      logger.info(`クライアント認証成功: ${clientId}`);
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: '認証失敗'
      }));
      ws.close();
    }
  }

  handleSubscribe(clientId, campaignId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    client.campaigns.add(campaignId);
    logger.info(`キャンペーン購読: ${clientId} -> ${campaignId}`);
  }

  handleUnsubscribe(clientId, campaignId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    client.campaigns.delete(campaignId);
    logger.info(`キャンペーン購読解除: ${clientId} -> ${campaignId}`);
  }

  // キャンペーンの更新を通知
  notifyCampaignUpdate(campaignId, data) {
    this.clients.forEach((client, clientId) => {
      if (client.campaigns.has(campaignId)) {
        client.ws.send(JSON.stringify({
          type: 'campaignUpdate',
          campaignId,
          data
        }));
      }
    });
  }

  // 通話状態の更新を通知
  notifyCallUpdate(campaignId, data) {
    this.clients.forEach((client, clientId) => {
      if (client.campaigns.has(campaignId)) {
        client.ws.send(JSON.stringify({
          type: 'callUpdate',
          campaignId,
          data
        }));
      }
    });
  }
}

module.exports = new WebSocketService();