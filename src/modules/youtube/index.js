import { logger } from '../../core/logger.js';
import { StreamExtractor } from './stream.js';

export class YoutubeModule {
  constructor(config) {
    this.config = config;
    this.extractor = new StreamExtractor(config);
    this.videoTitleCache = new Map();
  }
  
  async handleRoute(req, res, parsedUrl, authResult) {
    // Main YouTube interface
    if (parsedUrl.pathname === '/youtube') {
      await this.serveInterface(req, res, authResult);
      return true;
    }
    
    // Stream extraction API
    if (parsedUrl.pathname === '/youtube-stream') {
      await this.handleStreamExtraction(req, res, parsedUrl, authResult);
      return true;
    }
    
    // Search API (server-side)
    if (parsedUrl.pathname === '/youtube-search') {
      await this.handleSearch(req, res, parsedUrl, authResult);
      return true;
    }
    
    // Related videos API
    if (parsedUrl.pathname === '/youtube-related') {
      await this.handleRelated(req, res, parsedUrl, authResult);
      return true;
    }
    
    // Proxied embed
    if (parsedUrl.pathname === '/youtube-embed') {
      await this.serveEmbed(req, res, parsedUrl, authResult);
      return true;
    }
    
    return false;
  }
  
  async serveInterface(req, res, authResult) {
    const html = this.getYoutubeHTML();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    logger.info(`[${authResult.username}] Accessed YouTube interface`);
  }
  
  async handleStreamExtraction(req, res, parsedUrl, authResult) {
    const videoId = parsedUrl.query.v;
    
    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing video ID' }));
      return;
    }
    
    logger.info(`[${authResult.username}] Extracting stream: ${videoId}`);
    
    try {
      const result = await this.extractor.extract(videoId);
      
      if (result.success) {
        // Cache video title
        this.videoTitleCache.set(videoId, result.title);
        
        // IMPORTANT: Proxy stream URLs through our server to avoid CORS
        if (result.streamUrl) {
          result.streamUrl = `/proxy?url=${encodeURIComponent(result.streamUrl)}`;
        }
        if (result.videoUrl) {
          result.videoUrl = `/proxy?url=${encodeURIComponent(result.videoUrl)}`;
        }
        if (result.audioUrl) {
          result.audioUrl = `/proxy?url=${encodeURIComponent(result.audioUrl)}`;
        }
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(result));
        
        logger.success(`Stream extracted: ${result.title.substring(0, 50)}...`);
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
    } catch (error) {
      logger.error(`Stream extraction failed: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Extraction failed',
        message: error.message,
        fallback: true
      }));
    }
  }
  
  async handleSearch(req, res, parsedUrl, authResult) {
    const query = parsedUrl.query.q;
    const maxResults = parseInt(parsedUrl.query.max) || 24;
    
    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing query parameter' }));
      return;
    }
    
    logger.info(`[${authResult.username}] Searching YouTube: ${query}`);
    
    try {
      const result = await this.extractor.search(query, maxResults);
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(result));
      
    } catch (error) {
      logger.error(`YouTube search failed: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        results: []
      }));
    }
  }
  
  async handleRelated(req, res, parsedUrl, authResult) {
    const videoId = parsedUrl.query.v;
    const maxResults = parseInt(parsedUrl.query.max) || 20;
    
    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing video ID' }));
      return;
    }
    
    try {
      const result = await this.extractor.getRelated(videoId, maxResults);
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(result));
      
    } catch (error) {
      logger.error(`YouTube related failed: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        results: []
      }));
    }
  }
  
  async serveEmbed(req, res, parsedUrl, authResult) {
    const videoId = parsedUrl.query.v;
    
    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('Missing video ID');
      return;
    }
    
    logger.info(`[${authResult.username}] Serving proxied embed: ${videoId}`);
    
    const embedHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Player</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-family: Arial, sans-serif;
      font-size: 18px;
    }
  </style>
</head>
<body>
  <div class="loading">Loading player...</div>
  <iframe 
    src="/proxy?url=${encodeURIComponent('https://www.youtube.com/embed/' + videoId + '?autoplay=1')}" 
    allow="autoplay; encrypted-media; picture-in-picture" 
    allowfullscreen
    onload="document.querySelector('.loading').style.display='none'"
  ></iframe>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(embedHTML);
  }
  
  getYoutubeHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Titanium Proxy - YouTube</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0f;
      --card: #1a1a2e;
      --border: #2a2a3e;
      --primary: #4a9eff;
      --text: #e8e8f0;
      --text-dim: #a0a0b0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    
    .navbar {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 24px;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(10px);
    }
    .logo {
      font-size: 24px;
      font-weight: 900;
      background: linear-gradient(135deg, #4a9eff, #667eea);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .search-container {
      flex: 1;
      max-width: 600px;
      position: relative;
    }
    .search-box {
      width: 100%;
      padding: 12px 20px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }
    .search-box:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.1);
    }
    .back-btn {
      padding: 8px 16px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: all 0.2s;
      text-decoration: none;
    }
    .back-btn:hover { background: var(--border); }
    
    .container { padding: 32px 24px; max-width: 1400px; margin: 0 auto; }
    .results {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }
    .video-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      cursor: pointer;
      transition: all 0.3s;
    }
    .video-card:hover {
      transform: translateY(-4px);
      border-color: var(--primary);
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    }
    .video-thumbnail {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
      background: var(--bg);
    }
    .video-info { padding: 16px; }
    .video-title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .video-channel {
      font-size: 13px;
      color: var(--text-dim);
      font-weight: 500;
    }
    
    .player-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.95);
      backdrop-filter: blur(10px);
      display: none;
      z-index: 1000;
      padding: 40px;
    }
    .player-container.active { display: flex; }
    .player-wrapper {
      width: 100%;
      max-width: 1600px;
      margin: auto;
      position: relative;
    }
    .video-title-overlay {
      position: absolute;
      top: -50px;
      left: 0;
      background: rgba(0,0,0,0.8);
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      max-width: 80%;
    }
    .close-btn {
      position: absolute;
      top: -50px;
      right: 0;
      background: transparent;
      border: 2px solid var(--primary);
      color: var(--primary);
      padding: 12px 24px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      transition: all 0.2s;
    }
    .close-btn:hover {
      background: var(--primary);
      color: var(--bg);
    }
    video {
      width: 100%;
      aspect-ratio: 16/9;
      border: none;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      background: #000;
    }
    .loading, .error {
      text-align: center;
      padding: 80px 20px;
      font-size: 16px;
      color: var(--text-dim);
    }
    .error { color: #ff6b6b; }
    
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--primary); }
  </style>
</head>
<body>
  <nav class="navbar">
    <a href="/" class="back-btn">← BACK</a>
    <div class="logo">TITANIUM YOUTUBE</div>
    <div class="search-container">
      <input type="text" class="search-box" placeholder="Search videos..." id="searchInput">
    </div>
  </nav>
  
  <div class="container">
    <div class="results" id="results">
      <div class="loading">Search for videos...</div>
    </div>
  </div>
  
  <div class="player-container" id="playerContainer">
    <div class="player-wrapper">
      <div class="video-title-overlay" id="videoTitle"></div>
      <button class="close-btn" onclick="closePlayer()">✕ CLOSE</button>
      <video id="videoPlayer" controls></video>
    </div>
  </div>
  
  <script>
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('results');
    const playerContainer = document.getElementById('playerContainer');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) searchVideos(query);
      }
    });
    
    async function searchVideos(query) {
      resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
      
      try {
        const response = await fetch(\`/youtube-search?q=\${encodeURIComponent(query)}&max=24\`);
        const data = await response.json();
        
        if (data.success && data.results.length > 0) {
          displayResults(data.results);
        } else {
          resultsDiv.innerHTML = '<div class="error">No results found</div>';
        }
      } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="error">Error loading videos</div>';
      }
    }
    
    function displayResults(items) {
      resultsDiv.innerHTML = items.map(item => \`
        <div class="video-card" onclick="playVideo('\${item.videoId}', '\${escapeHtml(item.title)}')">
          <img class="video-thumbnail" src="/proxy?url=\${encodeURIComponent(item.thumbnail)}" alt="\${escapeHtml(item.title)}" loading="lazy">
          <div class="video-info">
            <div class="video-title">\${escapeHtml(item.title)}</div>
            <div class="video-channel">\${escapeHtml(item.author)}</div>
          </div>
        </div>
      \`).join('');
    }
    
    async function playVideo(videoId, title) {
      videoTitle.textContent = 'Loading...';
      playerContainer.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Clean up previous MediaSource if any
      if (videoPlayer._mediaSource) {
        try { videoPlayer._mediaSource.endOfStream(); } catch(e) {}
        videoPlayer._mediaSource = null;
      }
      videoPlayer.src = '';

      try {
        const response = await fetch(\`/youtube-stream?v=\${videoId}\`);
        const data = await response.json();

        if (!data.success) {
          videoTitle.textContent = 'Failed to load: ' + (data.error || 'unknown error');
          return;
        }

        videoTitle.textContent = data.title || title;

        // Adaptive (1080p): separate video + audio via MediaSource
        if (data.adaptive && data.videoUrl && data.audioUrl
            && typeof MediaSource !== 'undefined'
            && MediaSource.isTypeSupported(data.videoMimeType)
            && MediaSource.isTypeSupported(data.audioMimeType)) {
          await playAdaptive(data);
        } else if (data.streamUrl) {
          videoPlayer.src = data.streamUrl;
          videoPlayer.play().catch(() => {
            videoTitle.textContent = (data.title || title) + ' — click play';
          });
        } else {
          videoTitle.textContent = 'No playable stream found';
        }
      } catch (error) {
        console.error('Stream error:', error);
        videoTitle.textContent = 'Error loading video';
      }
    }

    async function playAdaptive(data) {
      const ms = new MediaSource();
      videoPlayer._mediaSource = ms;
      videoPlayer.src = URL.createObjectURL(ms);

      await new Promise(resolve => ms.addEventListener('sourceopen', resolve, { once: true }));

      const videoSB = ms.addSourceBuffer(data.videoMimeType);
      const audioSB = ms.addSourceBuffer(data.audioMimeType);

      // Buffer both tracks in parallel
      await Promise.all([
        streamIntoBuffer(data.videoUrl, videoSB),
        streamIntoBuffer(data.audioUrl, audioSB)
      ]);

      try { ms.endOfStream(); } catch(e) {}
      videoPlayer.play().catch(() => {});
    }

    async function streamIntoBuffer(url, sb) {
      const res = await fetch(url);
      const reader = res.body.getReader();
      const waitUpdate = () => new Promise(r => sb.addEventListener('updateend', r, { once: true }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (sb.updating) await waitUpdate();
        sb.appendBuffer(value);
        await waitUpdate();
      }
    }
    
    function closePlayer() {
      playerContainer.classList.remove('active');
      videoPlayer.pause();
      videoPlayer.src = '';
      document.body.style.overflow = 'auto';
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && playerContainer.classList.contains('active')) {
        closePlayer();
      }
    });
  </script>
</body>
</html>`;
  }
}