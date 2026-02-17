module.exports = {
  apps: [{
    name: 'solana-trading-bot',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    
    // Auto-restart settings
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
    
    // Advanced settings
    kill_timeout: 5000,
    listen_timeout: 10000,
    
    // Log rotation
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Monitoring
    monitoring: true,
    
    // Merge logs
    merge_logs: true
  }]
};
