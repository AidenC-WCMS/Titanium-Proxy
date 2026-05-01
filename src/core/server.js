import http from 'http';
import { URL } from 'url';
import { logger } from './logger.js';
import { AuthModule } from '../modules/auth/index.js';
import { ProxyModule } from '../modules/proxy/index.js';
import { SecurityModule } from '../modules/security/index.js';
import { YoutubeModule } from '../modules/youtube/index.js';
import { GamesModule } from '../modules/games/index.js';
import { ExtensionAPI } from '../extensions/api.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function createServer(config, extensions) {
  // Initialize modules
  const security = new SecurityModule(config);
  const auth = new AuthModule(config);
  const proxy = new ProxyModule(config);
  const youtube = config.enableYoutube ? new YoutubeModule(config) : null;
  const games = config.enableGames ? new GamesModule(config) : null;
  
  // Initialize auth module
  await auth.init();
  
  // Initialize extension API
  const extensionAPI = new ExtensionAPI({
    config,
    logger,
    auth,
    proxy,
    youtube,
    games,
    security
  });
  
  // Initialize all extensions
  for (const extension of extensions) {
    try {
      if (extension.initialize) {
        await extension.initialize(extensionAPI);
        logger.extension(`Initialized: ${extension.manifest.name} v${extension.manifest.version}`);
      }
    } catch (error) {
      logger.error(`Failed to initialize extension ${extension.manifest.name}:`, { error: error.message });
    }
  }
  
  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = Object.assign(new URL(req.url, 'http://localhost'), { query: Object.fromEntries(new URL(req.url, 'http://localhost').searchParams) });
      
      // Security checks
      if (!await security.checkRequest(req, res)) {
        return;
      }
      
      // Add security headers
      security.addHeaders(res);
      
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200, security.getCorsHeaders());
        res.end();
        return;
      }
      
      // Extension hooks: beforeRequest
      for (const extension of extensions) {
        if (extension.beforeRequest) {
          const handled = await extension.beforeRequest(req, res, parsedUrl);
          if (handled) return;
        }
      }
      
      // Auth routes
      if (await auth.handleRoute(req, res, parsedUrl)) {
        return;
      }
      
      // Check authentication for protected routes
      const authResult = await auth.authenticate(req);
      if (!authResult.authenticated && !isPublicRoute(parsedUrl.pathname)) {
        res.writeHead(302, { 'Location': '/login' });
        res.end();
        return;
      }
      
      // Extension routes
      for (const extension of extensions) {
        if (extension.routes) {
          const handled = await extension.routes(req, res, parsedUrl, authResult);
          if (handled) return;
        }
      }
      
      // YouTube routes
      if (youtube && await youtube.handleRoute(req, res, parsedUrl, authResult)) {
        return;
      }
      
      // Games routes
      if (games && await games.handleRoute(req, res, parsedUrl, authResult)) {
        return;
      }
      
      // Proxy route
      if (parsedUrl.pathname === '/proxy') {
        await proxy.handle(req, res, parsedUrl, authResult);
        return;
      }
      
      // Serve dashboard (authenticated users)
      if (parsedUrl.pathname === '/') {
        await serveDashboard(req, res, config, authResult);
        return;
      }
      
      // 404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      
    } catch (error) {
      logger.error('Request error:', { error: error.message, stack: error.stack });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    }
  });
  
  return server;
}

function isPublicRoute(pathname) {
  const publicRoutes = ['/login', '/health', '/favicon.ico'];
  return publicRoutes.includes(pathname);
}

async function serveDashboard(req, res, config, authResult) {
  const dashboardPath = join(config.publicPath, 'dashboard.html');
  
  if (existsSync(dashboardPath)) {
    const html = await readFile(dashboardPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    // Default dashboard
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getDefaultDashboard(authResult));
  }
}

function getDefaultDashboard(authResult) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Titanium Proxy - Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0a0a0f;
      color: #e8e8f0;
      min-height: 100vh;
    }
    .navbar {
      background: #1a1a2e;
      border-bottom: 1px solid #2a2a3e;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-size: 24px;
      font-weight: 900;
      background: linear-gradient(135deg, #4a9eff, #667eea);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .user-info {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .username {
      color: #a0a0b0;
      font-size: 14px;
    }
    .logout-btn {
      padding: 8px 16px;
      background: #2e1a1a;
      border: 1px solid #3a2a2a;
      border-radius: 8px;
      color: #ff6b6b;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    }
    .logout-btn:hover {
      background: #3e2a2a;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    h1 {
      font-size: 36px;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #a0a0b0;
      margin-bottom: 40px;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }
    .feature-card {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      padding: 24px;
      transition: all 0.3s;
    }
    .feature-card:hover {
      transform: translateY(-4px);
      border-color: #4a9eff;
    }
    .feature-card h3 {
      font-size: 20px;
      margin-bottom: 12px;
      color: #4a9eff;
    }
    .feature-card p {
      color: #a0a0b0;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .feature-btn {
      display: inline-block;
      padding: 10px 20px;
      background: linear-gradient(135deg, #4a9eff, #667eea);
      border-radius: 8px;
      color: white;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      transition: opacity 0.2s;
    }
    .feature-btn:hover {
      opacity: 0.9;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #1a2e1a;
      border: 1px solid #2a3e2a;
      border-radius: 12px;
      color: #6bff6b;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">TITANIUM PROXY</div>
    <div class="user-info">
      <span class="username">Logged in as: ${authResult.username}</span>
      <a href="/logout" class="logout-btn">Logout</a>
    </div>
  </nav>
  
  <div class="container">
    <div class="status-badge">P4 Mode Active - Full Features</div>
    <h1>Welcome to Titanium Proxy</h1>
    <p class="subtitle">All features ready to use</p>
    
    <div class="features">
      <div class="feature-card">
        <h3>Web Proxy</h3>
        <p>Browse any website through the proxy with content rewriting, DNS caching, and security features.</p>
        <form action="/proxy" method="get" style="display:flex;gap:8px;">
          <input type="text" name="url" placeholder="Enter URL..." style="flex:1;padding:8px 12px;background:#0a0a0f;border:1px solid #2a2a3e;border-radius:6px;color:#e8e8f0;font-size:14px;outline:none;">
          <button type="submit" class="feature-btn" style="border:none;cursor:pointer;">GO</button>
        </form>
      </div>
      
      <div class="feature-card">
        <h3>YouTube</h3>
        <p>Fast video streaming with InnerTube API. Search and watch videos directly.</p>
        <a href="/youtube" class="feature-btn">LAUNCH YOUTUBE</a>
      </div>
      
      <div class="feature-card">
        <h3>Games</h3>
        <p>Play embedded and local HTML5 games through the proxy.</p>
        <a href="/games" class="feature-btn">BROWSE GAMES</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}