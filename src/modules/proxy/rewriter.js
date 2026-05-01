import zlib from 'zlib';
import { logger } from '../../core/logger.js';

export class ContentRewriter {
  constructor(config) {
    this.config = config;
  }
  
  async rewrite(proxyRes, res, targetUrl, contentType) {
    const stream = this.getDecompressionStream(proxyRes);
    
    let body = '';
    stream.on('data', chunk => body += chunk.toString('utf-8'));
    stream.on('error', err => logger.error(`Stream error: ${err.message}`));
    stream.on('end', () => {
      const rewritten = this.rewriteContent(body, targetUrl, contentType);
      
      const headers = {
        'content-type': contentType,
        'cache-control': 'no-cache',
        'access-control-allow-origin': '*',
        'content-length': Buffer.byteLength(rewritten)
      };
      
      res.writeHead(proxyRes.statusCode, headers);
      res.end(rewritten);
    });
  }
  
  getDecompressionStream(proxyRes) {
    const encoding = proxyRes.headers['content-encoding'];
    
    if (encoding === 'gzip') {
      return proxyRes.pipe(zlib.createGunzip());
    } else if (encoding === 'deflate') {
      return proxyRes.pipe(zlib.createInflate());
    } else if (encoding === 'br') {
      return proxyRes.pipe(zlib.createBrotliDecompress());
    }
    
    return proxyRes;
  }
  
  rewriteContent(body, targetUrl, contentType) {
    const isHTML = contentType.includes('text/html');
    const baseUrl = new URL(targetUrl);
    const baseUrlStr = `${baseUrl.protocol}//${baseUrl.hostname}`;
    
    if (isHTML) {
      return this.rewriteHTML(body, baseUrlStr);
    } else {
      return this.rewriteJavaScript(body, baseUrlStr);
    }
  }
  
  rewriteHTML(html, baseUrl) {
    let rewritten = html;
    
    // Remove CSP headers
    rewritten = rewritten.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
    
    // Rewrite URLs in attributes
    rewritten = rewritten.replace(/(href|src|action)=(["'])(\/[^"'\s\/][^"'\s]*)\2/gi, (m, attr, q, path) => {
      if (path.includes('/proxy?url=')) return m;
      return `${attr}=${q}/proxy?url=${encodeURIComponent(baseUrl + path)}${q}`;
    });
    
    rewritten = rewritten.replace(/(href|src|action)=(["'])(https?:\/\/[^"'\s]+)\2/gi, (m, attr, q, url) => {
      if (url.includes('/proxy?url=')) return m;
      return `${attr}=${q}/proxy?url=${encodeURIComponent(url)}${q}`;
    });
    
    // Inject proxy script
    const injection = this.getInjectionScript(baseUrl);
    rewritten = rewritten.replace(/<head[^>]*>/i, m => m + injection);
    
    return rewritten;
  }
  
  rewriteJavaScript(js, baseUrl) {
    let rewritten = js;
    
    // Rewrite location redirects
    rewritten = rewritten.replace(/([^a-zA-Z0-9_$])location\s*=\s*["']\/([^"']*)/g, (m, prefix, path) => {
      return `${prefix}location = "/proxy?url=${encodeURIComponent(baseUrl + '/' + path)}`;
    });
    
    rewritten = rewritten.replace(/location\.href\s*=\s*["']\/([^"']*)/g, (m, path) => {
      return `location.href = "/proxy?url=${encodeURIComponent(baseUrl + '/' + path)}`;
    });
    
    return rewritten;
  }
  
  getInjectionScript(baseUrl) {
    return `
<script>
(function() {
  const base = '${baseUrl}';
  const proxy = (u) => {
    if (!u || typeof u !== 'string') return u;
    if (u.startsWith('data:') || u.startsWith('blob:') || u.includes('/proxy?url=')) return u;
    let full = u.startsWith('http') ? u : u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? base + u : u;
    if (full.startsWith('http') || full.startsWith('//')) return '/proxy?url=' + encodeURIComponent(full);
    return u;
  };
  
  const origFetch = window.fetch;
  window.fetch = (u, o) => origFetch(proxy(u), o);
  
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u, ...a) { 
    return origOpen.call(this, m, proxy(u), ...a); 
  };
})();
</script>`;
  }
}