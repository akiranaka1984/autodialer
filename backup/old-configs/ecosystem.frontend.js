module.exports = {
  apps: [{
    name: 'autodialer-frontend',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/autodialer/frontend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      HOST: '0.0.0.0',
      PORT: 3003,
      REACT_APP_API_URL: 'http://localhost:5000/api',
      REACT_APP_WS_URL: 'ws://localhost:5000/ws'
    }
  }]
};
