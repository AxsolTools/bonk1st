/**
 * AQUA Launchpad - Digital Ocean Deployment
 * Deploys the app to Digital Ocean App Platform via API
 * 
 * Usage: DO_API_KEY=your_key node scripts/deploy-digitalocean.mjs
 */

const DO_API_KEY = process.env.DO_API_KEY;
const API_BASE = 'https://api.digitalocean.com/v2';

if (!DO_API_KEY) {
  console.error('❌ Error: DO_API_KEY environment variable is required');
  console.log('Usage: DO_API_KEY=your_key node scripts/deploy-digitalocean.mjs');
  process.exit(1);
}

// App specification
const appSpec = {
  name: 'aqua-launchpad',
  region: 'nyc',
  services: [
    {
      name: 'web',
      github: {
        repo: 'AxsolTools/aqua',
        branch: 'main',
        deploy_on_push: true,
      },
      build_command: 'pnpm install && pnpm build',
      run_command: 'pnpm start',
      http_port: 3000,
      instance_size_slug: 'apps-s-1vcpu-1gb',
      instance_count: 1,
      envs: [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || '' },
        { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
        { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || '', type: 'SECRET' },
        { key: 'HELIUS_API_KEY', value: process.env.HELIUS_API_KEY || '', type: 'SECRET' },
        { key: 'HELIUS_RPC_URL', value: process.env.HELIUS_RPC_URL || '' },
        { key: 'PLATFORM_FEE_PERCENT', value: '2' },
        { key: 'REFERRAL_ENABLED', value: 'true' },
        { key: 'REFERRAL_SHARE_PERCENT', value: '50' },
        { key: 'NODE_ENV', value: 'production' },
      ],
    },
  ],
};

async function doRequest(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${DO_API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }
  
  return data;
}

async function checkExistingApp() {
  console.log('🔍 Checking for existing app...');
  const { apps } = await doRequest('GET', '/apps');
  return apps?.find(app => app.spec?.name === 'aqua-launchpad');
}

async function createApp() {
  console.log('🚀 Creating new app on Digital Ocean...');
  const result = await doRequest('POST', '/apps', { spec: appSpec });
  return result.app;
}

async function updateApp(appId) {
  console.log('🔄 Updating existing app...');
  const result = await doRequest('PUT', `/apps/${appId}`, { spec: appSpec });
  return result.app;
}

async function getDeploymentStatus(appId) {
  const { app } = await doRequest('GET', `/apps/${appId}`);
  return app;
}

async function deploy() {
  console.log('🌊 AQUA Launchpad - Digital Ocean Deployment\n');
  console.log('----------------------------------------');
  
  try {
    // Check if app already exists
    let app = await checkExistingApp();
    
    if (app) {
      console.log(`📱 Found existing app: ${app.id}`);
      app = await updateApp(app.id);
    } else {
      app = await createApp();
      console.log(`✅ Created new app: ${app.id}`);
    }
    
    console.log('\n----------------------------------------');
    console.log('✅ Deployment initiated!');
    console.log(`\n📱 App ID: ${app.id}`);
    console.log(`🌐 App URL: https://${app.default_ingress || 'pending...'}`);
    console.log(`📊 Status: ${app.active_deployment?.phase || 'BUILDING'}`);
    
    console.log('\n📋 Next steps:');
    console.log('1. Monitor deployment at: https://cloud.digitalocean.com/apps');
    console.log('2. The build may take 5-10 minutes');
    console.log('3. You\'ll get a .ondigitalocean.app URL when ready');
    
    // Wait and check status
    console.log('\n⏳ Waiting for deployment status...');
    await new Promise(r => setTimeout(r, 10000));
    
    const status = await getDeploymentStatus(app.id);
    console.log(`\n📊 Current status: ${status.active_deployment?.phase || status.in_progress_deployment?.phase || 'PENDING'}`);
    
    if (status.live_url) {
      console.log(`🌐 Live URL: ${status.live_url}`);
    }
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    
    if (error.message.includes('unauthorized')) {
      console.log('\n💡 Tip: Make sure your Digital Ocean API key has write access');
    }
  }
}

deploy();
