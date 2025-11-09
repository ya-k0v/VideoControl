// PM2 ecosystem configuration for VideoControl
// Run with: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'videocontrol',
      script: './server.js',
      
      // Clustering
      instances: 'max', // or number like 4
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        LOG_LEVEL: 'info'
      },
      
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        LOG_LEVEL: 'debug'
      },
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced features
      watch: false, // Enable in development if needed
      ignore_watch: ['node_modules', 'logs', 'public/content'],
      max_memory_restart: '1G',
      
      // Graceful restart
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Auto restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Cron restart (optional - restart every night at 3 AM)
      // cron_restart: '0 3 * * *',
      
      // Source map support
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID'
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['server1.example.com', 'server2.example.com'],
      ref: 'origin/main',
      repo: 'git@github.com:ya-k0v/VideoControl.git',
      path: '/var/www/videocontrol',
      'post-deploy': 'npm install && npm run db:migrate:prod && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};

