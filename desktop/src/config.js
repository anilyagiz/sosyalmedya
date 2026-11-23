'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP_NAME = 'sosyalmedya';

// Fixed ports. The public one (4007) must stay the same forever because the
// social-network apps the user creates are registered with callback URLs on it.
const PORTS = {
  public: 4007,
  postgres: 54329,
  redis: 63799,
  temporal: 17233,
  backend: 13000,
  orchestrator: 13002,
  frontend: 14200,
};

const PUBLIC_URL = `http://localhost:${PORTS.public}`;

function installRoot() {
  if (process.env.SOSYALMEDYA_ROOT) return process.env.SOSYALMEDYA_ROOT;
  return path.dirname(process.execPath);
}

function dataRoot() {
  if (process.env.SOSYALMEDYA_DATA) return process.env.SOSYALMEDYA_DATA;
  const base =
    process.env.LOCALAPPDATA ||
    path.join(require('os').homedir(), 'AppData', 'Local');
  return path.join(base, APP_NAME, 'data');
}

function paths() {
  const root = installRoot();
  const data = dataRoot();
  const runtime = path.join(root, 'runtime');
  return {
    root,
    runtime,
    app: path.join(root, 'app'),
    node: path.join(runtime, 'node', 'node.exe'),
    pgBin: path.join(runtime, 'pgsql', 'bin'),
    redis: path.join(runtime, 'redis', 'redis-server.exe'),
    temporal: path.join(runtime, 'temporal', 'temporal.exe'),
    prismaCli: path.join(root, 'app', 'node_modules', 'prisma', 'build', 'index.js'),
    loopback: path.join(runtime, 'loopback.js'),
    data,
    pgData: path.join(data, 'postgres'),
    redisData: path.join(data, 'redis'),
    temporalDb: path.join(data, 'temporal', 'temporal.db'),
    uploads: path.join(data, 'uploads'),
    logs: path.join(data, 'logs'),
    configFile: path.join(data, 'config.json'),
  };
}

// Keys the user can fill in from the settings window. Grouped by network,
// each with the env var names Postiz reads.
const PROVIDERS = [
  {
    id: 'x',
    name: 'X (Twitter)',
    help: 'https://developer.x.com/en/portal/dashboard',
    fields: [
      ['X_API_KEY', 'API Key'],
      ['X_API_SECRET', 'API Key Secret'],
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    help: 'https://www.linkedin.com/developers/apps',
    callback: ['linkedin', 'linkedin-page'],
    fields: [
      ['LINKEDIN_CLIENT_ID', 'Client ID'],
      ['LINKEDIN_CLIENT_SECRET', 'Client Secret'],
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook / Instagram',
    help: 'https://developers.facebook.com/apps',
    callback: ['facebook', 'instagram'],
    fields: [
      ['FACEBOOK_APP_ID', 'App ID'],
      ['FACEBOOK_APP_SECRET', 'App Secret'],
    ],
  },
  {
    id: 'threads',
    name: 'Threads',
    help: 'https://developers.facebook.com/apps',
    fields: [
      ['THREADS_APP_ID', 'App ID'],
      ['THREADS_APP_SECRET', 'App Secret'],
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    help: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      ['YOUTUBE_CLIENT_ID', 'Client ID'],
      ['YOUTUBE_CLIENT_SECRET', 'Client Secret'],
    ],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    help: 'https://developers.tiktok.com/apps',
    fields: [
      ['TIKTOK_CLIENT_ID', 'Client Key'],
      ['TIKTOK_CLIENT_SECRET', 'Client Secret'],
    ],
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    help: 'https://developers.pinterest.com/apps',
    fields: [
      ['PINTEREST_CLIENT_ID', 'App ID'],
      ['PINTEREST_CLIENT_SECRET', 'App Secret'],
    ],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    help: 'https://www.reddit.com/prefs/apps',
    fields: [
      ['REDDIT_CLIENT_ID', 'Client ID'],
      ['REDDIT_CLIENT_SECRET', 'Secret'],
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    help: 'https://discord.com/developers/applications',
    fields: [
      ['DISCORD_CLIENT_ID', 'Client ID'],
      ['DISCORD_CLIENT_SECRET', 'Client Secret'],
      ['DISCORD_BOT_TOKEN_ID', 'Bot Token'],
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    help: 'https://api.slack.com/apps',
    fields: [
      ['SLACK_ID', 'Client ID'],
      ['SLACK_SECRET', 'Client Secret'],
      ['SLACK_SIGNING_SECRET', 'Signing Secret'],
    ],
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    help: 'https://mastodon.social/settings/applications',
    fields: [
      ['MASTODON_URL', 'Sunucu adresi (örn. https://mastodon.social)'],
      ['MASTODON_CLIENT_ID', 'Client key'],
      ['MASTODON_CLIENT_SECRET', 'Client secret'],
    ],
  },
  {
    id: 'openai',
    name: 'Yapay zekâ (OpenAI) — isteğe bağlı',
    help: 'https://platform.openai.com/api-keys',
    noCallback: true,
    fields: [['OPENAI_API_KEY', 'API Key']],
  },
];

const ALLOWED_KEYS = new Set(
  PROVIDERS.flatMap((p) => p.fields.map(([key]) => key))
);

function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function load() {
  const p = paths();
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(p.configFile, 'utf8'));
  } catch {
    config = {};
  }
  let changed = false;
  if (!config.jwtSecret) {
    config.jwtSecret = randomSecret();
    changed = true;
  }
  if (!config.dbPassword) {
    config.dbPassword = randomSecret(24);
    changed = true;
  }
  if (!config.keys || typeof config.keys !== 'object') {
    config.keys = {};
    changed = true;
  }
  if (config.openAtLogin === undefined) {
    config.openAtLogin = true;
    changed = true;
  }
  if (changed) save(config);
  return config;
}

function save(config) {
  const p = paths();
  fs.mkdirSync(path.dirname(p.configFile), { recursive: true });
  const tmp = p.configFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, p.configFile);
}

function setKeys(config, keys) {
  const next = { ...config.keys };
  for (const [key, value] of Object.entries(keys || {})) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const v = String(value ?? '').trim();
    if (v) next[key] = v;
    else delete next[key];
  }
  config.keys = next;
  save(config);
  return config;
}

// Forward slashes: Postiz builds upload paths by string concatenation with "/".
function slash(p) {
  return p.replace(/\\/g, '/');
}

function databaseUrl(config) {
  return `postgresql://postgres:${encodeURIComponent(
    config.dbPassword
  )}@127.0.0.1:${PORTS.postgres}/sosyalmedya`;
}

function appEnv(config) {
  const p = paths();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NODE_OPTIONS: `--require "${slash(p.loopback)}" --max-old-space-size=4096`,
    DATABASE_URL: databaseUrl(config),
    REDIS_URL: `redis://127.0.0.1:${PORTS.redis}`,
    TEMPORAL_ADDRESS: `127.0.0.1:${PORTS.temporal}`,
    TEMPORAL_NAMESPACE: 'default',
    JWT_SECRET: config.jwtSecret,
    MAIN_URL: PUBLIC_URL,
    FRONTEND_URL: PUBLIC_URL,
    NEXT_PUBLIC_BACKEND_URL: `${PUBLIC_URL}/api`,
    BACKEND_INTERNAL_URL: `http://127.0.0.1:${PORTS.backend}`,
    IS_GENERAL: 'true',
    NOT_SECURED: 'true',
    DISABLE_REGISTRATION: 'false',
    RUN_CRON: 'true',
    API_LIMIT: '30',
    STORAGE_PROVIDER: 'local',
    UPLOAD_DIRECTORY: slash(p.uploads),
    NEXT_PUBLIC_UPLOAD_DIRECTORY: '/uploads',
    NEXT_TELEMETRY_DISABLED: '1',
    CHECKPOINT_DISABLE: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  };
  for (const key of ALLOWED_KEYS) delete env[key];
  for (const [key, value] of Object.entries(config.keys || {})) {
    if (ALLOWED_KEYS.has(key) && value) env[key] = value;
  }
  // Never hand the Electron-specific switches down to plain Node processes.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.PORT;
  return env;
}

module.exports = {
  APP_NAME,
  PORTS,
  PUBLIC_URL,
  PROVIDERS,
  paths,
  load,
  save,
  setKeys,
  appEnv,
  slash,
};
