// 利用可能ポート自動検出
const net = require('net');

function findAvailablePort(startPort = 5000) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(startPort, (err) => {
      if (err) {
        // ポートが使用中の場合、次のポートを試す
        server.close();
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        const port = server.address().port;
        server.close(() => {
          console.log(`✅ 利用可能ポート発見: ${port}`);
          resolve(port);
        });
      }
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // ポート使用中、次を試す
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

module.exports = { findAvailablePort };
