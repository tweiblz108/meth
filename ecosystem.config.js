module.exports = {
  apps : [{
    name: 'Parse Server',
    script: './node_modules/parse-server/bin/parse-server',
    args: 'parse-server-config.json',
    instances: 1
  },  {
    name: 'Parse Dashboard',
    script: './node_modules/parse-dashboard/bin/parse-dashboard',
    args: '--config parse-dashboard-config.json',
    instances: 1
  },{
    name: 'Proxy Server',
    script: 'src/server.js',
    instances: 1
  }, {
    name: 'Rat Works Distrib Server',
    script: 'src/workd.js',
    instances: 1
  }, {
    name: 'Content Worker',
    script: 'src/content_worker.js',
    instances: 2
  }, {
    name: 'WordPress Worker',
    script: 'src/wordpress_worker.js',
    instances: 4,
    env: {
      NODE_TLS_REJECT_UNAUTHORIZED: 0
    }
  }],
  deploy : {
    production : {
      user : 'node',
      host : '212.83.163.1',
      ref  : 'origin/master',
      repo : 'git@github.com:repo.git',
      path : '/var/www/production',
      'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
