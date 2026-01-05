module.exports = {
  apps: [
    {
      name: 'solana-dexscreener-bot',
      script: 'index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      watch: false,
      max_memory_restart: '300M',
      time: true
    }
  ]
};