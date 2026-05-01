import { logger } from '../../core/logger.js';
import { GameLoader } from './loader.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

export class GamesModule {
  constructor(config) {
    this.config = config;
    this.loader = new GameLoader(config);
    this.gamesPath = join(config.dataPath, '../games');
    this.iconsPath = join(this.gamesPath, 'icons');
  }
  
  async handleRoute(req, res, parsedUrl, authResult) {
    // Games listing page
    if (parsedUrl.pathname === '/games') {
      await this.serveGamesPage(req, res, authResult);
      return true;
    }
    
    // Games JSON API
    if (parsedUrl.pathname === '/games.json') {
      await this.serveGamesJSON(req, res);
      return true;
    }
    
    // Individual game
    if (parsedUrl.pathname.startsWith('/game/')) {
      await this.serveGame(req, res, parsedUrl, authResult);
      return true;
    }
    
    // Game icons
    if (parsedUrl.pathname.startsWith('/game-icon/')) {
      await this.serveIcon(req, res, parsedUrl);
      return true;
    }
    
    return false;
  }
  
  async serveGamesPage(req, res, authResult) {
    const htmlPath = join(this.config.publicPath, 'games.html');
    
    if (existsSync(htmlPath)) {
      const html = await readFile(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      logger.info(`[${authResult.username}] Accessed games page`);
    } else {
      // Serve default games page
      const html = this.getDefaultGamesHTML();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    }
  }
  
  async serveGamesJSON(req, res) {
    try {
      const games = await this.loader.loadGames();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify(games));
    } catch (error) {
      logger.error(`Failed to serve games.json: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load games' }));
    }
  }
  
  async serveGame(req, res, parsedUrl, authResult) {
    const gameId = this.sanitizePath(parsedUrl.pathname.replace('/game/', ''));
    
    try {
      const games = await this.loader.loadGames();
      const game = games.games.find(g => g.id === gameId);
      
      if (!game) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Game not found');
        return;
      }
      
      if (game.iframeUrl) {
        // Embedded game
        const html = this.getIframeGameHTML(game);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        logger.info(`[${authResult.username}] Playing iframe game: ${game.name}`);
      } else if (game.html) {
        // Local HTML game
        const gamePath = join(this.gamesPath, this.sanitizePath(game.html));
        
        // Security: Ensure path is within games directory
        const resolvedPath = resolve(gamePath);
        const gamesDir = resolve(this.gamesPath);
        
        if (!resolvedPath.startsWith(gamesDir)) {
          logger.warn(`Path traversal attempt blocked: ${game.html}`);
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }
        
        if (existsSync(gamePath)) {
          const gameHTML = await readFile(gamePath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(gameHTML);
          logger.info(`[${authResult.username}] Playing local game: ${game.name}`);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Game HTML not found');
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid game configuration');
      }
    } catch (error) {
      logger.error(`Error serving game: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error loading game');
    }
  }
  
  async serveIcon(req, res, parsedUrl) {
    const iconName = this.sanitizePath(
      decodeURIComponent(parsedUrl.pathname.replace('/game-icon/', ''))
    );
    const iconPath = join(this.iconsPath, iconName);
    
    // Security: Ensure path is within icons directory
    const resolvedPath = resolve(iconPath);
    const iconsDir = resolve(this.iconsPath);
    
    if (!resolvedPath.startsWith(iconsDir)) {
      logger.warn(`Path traversal attempt blocked: ${iconName}`);
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    
    try {
      if (existsSync(iconPath)) {
        const ext = iconName.split('.').pop().toLowerCase();
        const mimeTypes = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'svg': 'image/svg+xml',
          'webp': 'image/webp'
        };
        
        const icon = await readFile(iconPath);
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(icon);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Icon not found');
      }
    } catch (error) {
      logger.error(`Error serving icon: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error loading icon');
    }
  }
  
  sanitizePath(filePath) {
    // Remove path traversal attempts
    return filePath.replace(/\.\./g, '').replace(/[\/\\]/g, '');
  }
  
  getIframeGameHTML(game) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${game.name} - Titanium Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
    }
    .game-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .game-header {
      background: rgba(20, 20, 30, 0.95);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      z-index: 100;
    }
    .back-btn {
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
      cursor: pointer;
    }
    .back-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .game-title {
      color: white;
      font-size: 18px;
      font-weight: 700;
      flex: 1;
    }
    .fullscreen-btn {
      padding: 8px 16px;
      background: rgba(66, 153, 225, 0.2);
      border: 1px solid rgba(66, 153, 225, 0.4);
      border-radius: 8px;
      color: #4299e1;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
      border: none;
    }
    .fullscreen-btn:hover {
      background: rgba(66, 153, 225, 0.3);
    }
    iframe {
      flex: 1;
      width: 100%;
      border: none;
      background: #000;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 18px;
      text-align: center;
      z-index: 1;
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top: 3px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="game-container">
    <div class="game-header">
      <a href="/games" class="back-btn">← Back to Games</a>
      <div class="game-title">${game.name}</div>
      <button class="fullscreen-btn" onclick="toggleFullscreen()">Fullscreen</button>
    </div>
    <div class="loading" id="loading">
      <div class="spinner"></div>
      Loading game...
    </div>
    <iframe 
      id="gameFrame" 
      src="/proxy?url=${encodeURIComponent(game.iframeUrl)}"
      allow="autoplay; fullscreen; gamepad; microphone; focus-without-user-activation"
      allowfullscreen
      onload="document.getElementById('loading').style.display='none'"
    ></iframe>
  </div>
  <script>
    function toggleFullscreen() {
      const frame = document.getElementById('gameFrame');
      if (!document.fullscreenElement) {
        frame.requestFullscreen().catch(err => {
          alert('Error entering fullscreen: ' + err.message);
        });
      } else {
        document.exitFullscreen();
      }
    }
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    });
  </script>
</body>
</html>`;
  }
  
  getDefaultGamesHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Titanium Proxy - Games</title>
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
      align-items: center;
      gap: 24px;
    }
    .logo {
      font-size: 24px;
      font-weight: 900;
      background: linear-gradient(135deg, #4a9eff, #667eea);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .back-btn {
      padding: 8px 16px;
      background: #0a0a0f;
      border: 1px solid #2a2a3e;
      border-radius: 8px;
      color: #e8e8f0;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.2s;
    }
    .back-btn:hover { background: #2a2a3e; }
    .container { padding: 32px 24px; max-width: 1400px; margin: 0 auto; }
    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }
    .game-card {
      background: #1a1a2e;
      border: 1px solid #2a2a3e;
      border-radius: 16px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.3s;
    }
    .game-card:hover {
      transform: translateY(-4px);
      border-color: #4a9eff;
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    }
    .game-icon {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
      background: #0a0a0f;
    }
    .game-info { padding: 16px; }
    .game-name {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .game-description {
      font-size: 13px;
      color: #a0a0b0;
      line-height: 1.4;
    }
    .loading {
      text-align: center;
      padding: 80px 20px;
      color: #a0a0b0;
    }
  </style>
</head>
<body>
  <nav class="navbar">
    <a href="/" class="back-btn">← BACK</a>
    <div class="logo">TITANIUM GAMES</div>
  </nav>
  <div class="container">
    <div class="games-grid" id="gamesGrid">
      <div class="loading">Loading games...</div>
    </div>
  </div>
  <script>
    async function loadGames() {
      try {
        const response = await fetch('/games.json');
        const data = await response.json();
        displayGames(data.games || []);
      } catch (error) {
        document.getElementById('gamesGrid').innerHTML = 
          '<div class="loading">Error loading games</div>';
      }
    }
    
    function displayGames(games) {
      const grid = document.getElementById('gamesGrid');
      
      if (games.length === 0) {
        grid.innerHTML = '<div class="loading">No games available</div>';
        return;
      }
      
      grid.innerHTML = games.map(game => \`
        <div class="game-card" onclick="location.href='/game/\${game.id}'">
          <img class="game-icon" src="/game-icon/\${game.icon}" alt="\${game.name}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22%3E%3Crect fill=%22%231a1a2e%22 width=%22320%22 height=%22180%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%234a9eff%22 font-family=%22Arial%22 font-size=%2220%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
          <div class="game-info">
            <div class="game-name">\${game.name}</div>
            <div class="game-description">\${game.description || ''}</div>
          </div>
        </div>
      \`).join('');
    }
    
    loadGames();
  </script>
</body>
</html>`;
  }
}