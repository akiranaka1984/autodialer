module.exports = {
  apps: [
    {
      name: 'autodialer',
      script: './src/index.js',
      cwd: '/var/www/autodialer/backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        DISABLE_AUTO_DIALER: 'false'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      max_restarts: 3,
      min_uptime: '30s',
      restart_delay: 5000
    },
    {
      name: 'autodialer-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/autodialer/frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '200M',
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
        PORT: 3003,
        BROWSER: 'none',
        GENERATE_SOURCEMAP: 'false'
      }
    }
  ]
};
