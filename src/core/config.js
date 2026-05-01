import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

const defaultConfig = {
  port: parseInt(process.env.PORT) || 3000,
  host: process.env.HOST || 'localhost',
  
  // Paths
  dataPath: process.env.DATA_PATH || './data',
  extensionsPath: process.env.EXTENSIONS_PATH || './extensions',
  publicPath: process.env.PUBLIC_PATH || './public',
  
  // Security
  sessionSecret: process.env.SESSION_SECRET || null,
  maxSessionAge: parseInt(process.env.MAX_SESSION_AGE) || 86400000,
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  
  // Rate limiting
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  maxRequestsPerWindow: parseInt(process.env.MAX_REQUESTS_PER_WINDOW) || 100,
  
  // Proxy
  proxyTimeout: parseInt(process.env.PROXY_TIMEOUT) || 30000,
  dnsServers: (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','),
  dnsCacheTTL: parseInt(process.env.DNS_CACHE_TTL) || 300000,
  
  // YouTube
  youtubeApiKey: process.env.YOUTUBE_API_KEY || null,
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  
  // Features
  enableFingerprinting: process.env.ENABLE_FINGERPRINTING !== 'false',
  enableYoutube: process.env.ENABLE_YOUTUBE !== 'false',
  enableGames: process.env.ENABLE_GAMES !== 'false',
};

export async function loadConfig() {
  const configPath = join(__dirname, '../../config/default.json');
  
  let fileConfig = {};
  if (existsSync(configPath)) {
    try {
      const data = await readFile(configPath, 'utf8');
      fileConfig = JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load config file:', error.message);
    }
  }
  
  // Merge: defaults < file config < env vars
  const config = { ...defaultConfig, ...fileConfig };
  
  // Generate session secret if not provided
  if (!config.sessionSecret) {
    const crypto = await import('crypto');
    config.sessionSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  Generated temporary session secret. Set SESSION_SECRET env var for persistence.');
  }
  
  return config;
}