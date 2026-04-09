/**
 * PM2 Configuration for PhotoStudio SaaS
 * 
 * PM2 is a process manager for Node.js applications.
 * It helps you run and monitor multiple processes.
 * 
 * Installation:
 *   npm install -g pm2
 * 
 * Start with PM2:
 *   pm2 start ecosystem.config.js
 * 
 * View logs:
 *   pm2 logs
 * 
 * Monitor:
 *   pm2 monit
 * 
 * Restart:
 *   pm2 restart all
 * 
 * Save PM2 config:
 *   pm2 save
 * 
 * Setup startup script:
 *   pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'photostudio-web',
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_file: './logs/web.log',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s',
    },
    {
      name: 'photostudio-workers',
      script: './scripts/workers.ts',
      interpreter: './node_modules/.bin/tsx',
      instances: 2,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      log_file: './logs/workers.log',
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      // Workers can be scaled independently
      // instances: 'max' for using all CPU cores (if workers are stateless)
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/photostudio.git',
      path: '/var/www/photostudio',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
