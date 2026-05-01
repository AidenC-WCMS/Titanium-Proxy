import http from 'http';
import https from 'https';
import { parse as parseUrl } from 'url';
import { logger } from '../../core/logger.js';
import { ContentRewriter } from './rewriter.js';
import { DNSResolver } from './dns.js';

export class ProxyModule {
  constructor(config) {
    this.config = config;
    this.rewriter = new ContentRewriter(config);
    this.dns = new DNSResolver(config);
  }
  
  async handle(req, res, parsedUrl, authResult) {
    const targetUrl = parsedUrl.query.url;
    
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing url parameter');
      return;
    }
    
    // Validate and sanitize URL
    let fullUrl;
    try {
      fullUrl = targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl;
      const urlObj = new URL(fullUrl);
      
      // SSRF protection
      if (this.isBlockedHost(urlObj.hostname)) {
        logger.warn(`SSRF attempt blocked: ${urlObj.hostname}`);
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Access to internal network is forbidden');
        return;
      }
    } catch (error) {
      logger.error(`Invalid proxy URL: ${targetUrl}`);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid URL format');
      return;
    }
    
    const shortUrl = fullUrl.length > 80 ? fullUrl.substring(0, 80) + '...' : fullUrl;
    logger.proxy(`[${authResult.username}] ${shortUrl}`);
    
    try {
      await this.proxyRequest(req, res, fullUrl, authResult);
    } catch (error) {
      logger.error(`Proxy error: ${error.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Proxy error');
      }
    }
  }
  
  async proxyRequest(req, res, targetUrl, authResult) {
    const targetParsed = parseUrl(targetUrl);
    const protocol = targetParsed.protocol === 'https:' ? https : http;
    
    // Resolve DNS with caching
    const resolvedHost = await this.dns.resolve(targetParsed.hostname);
    
    const options = {
      hostname: resolvedHost,
      port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
      path: targetParsed.path || '/',
      method: req.method,
      headers: this.getProxyHeaders(req, targetParsed.hostname),
      servername: targetParsed.hostname,
      timeout: this.config.proxyTimeout
    };
    
    return new Promise((resolve, reject) => {
      const proxyReq = protocol.request(options, async (proxyRes) => {
        try {
          await this.handleProxyResponse(req, res, proxyRes, targetUrl, authResult);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      proxyReq.on('error', (error) => {
        logger.error(`Proxy request failed: ${error.message}`);
        reject(error);
      });
      
      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (req.method === 'POST' || req.method === 'PUT') {
        req.pipe(proxyReq);
      } else {
        proxyReq.end();
      }
    });
  }
  
  async handleProxyResponse(req, res, proxyRes, targetUrl, authResult) {
    // Handle redirects
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      const redirectUrl = this.resolveRedirectUrl(proxyRes.headers.location, targetUrl);
      res.writeHead(proxyRes.statusCode, {
        'Location': `/proxy?url=${encodeURIComponent(redirectUrl)}`,
        'Access-Control-Allow-Origin': '*'
      });
      res.end();
      return;
    }
    
    const contentType = proxyRes.headers['content-type'] || '';
    
    // Rewrite HTML/JS content
    if (this.shouldRewrite(contentType, targetUrl)) {
      await this.rewriter.rewrite(proxyRes, res, targetUrl, contentType);
    } else {
      // Stream other content directly
      const headers = { ...proxyRes.headers };
      headers['access-control-allow-origin'] = '*';
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    }
  }
  
  shouldRewrite(contentType, url) {
    return contentType.includes('text/html') || 
           contentType.includes('javascript') ||
           contentType.includes('application/x-javascript') ||
           url.endsWith('.js');
  }
  
  getProxyHeaders(req, hostname) {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Host': hostname,
      ...(req.headers.cookie && { 'Cookie': req.headers.cookie })
    };
  }
  
  resolveRedirectUrl(location, baseUrl) {
    if (location.startsWith('http')) {
      return location;
    }
    
    const baseParsed = new URL(baseUrl);
    
    if (location.startsWith('//')) {
      return `https:${location}`;
    }
    
    if (location.startsWith('/')) {
      return `${baseParsed.protocol}//${baseParsed.hostname}${location}`;
    }
    
    // Relative URL
    const basePath = baseParsed.pathname.substring(0, baseParsed.pathname.lastIndexOf('/') + 1);
    return `${baseParsed.protocol}//${baseParsed.hostname}${basePath}${location}`;
  }
  
  isBlockedHost(hostname) {
    const blockedPatterns = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./
    ];
    
    const lower = hostname.toLowerCase();
    return blockedPatterns.some(pattern => {
      if (typeof pattern === 'string') {
        return lower === pattern || lower.startsWith(pattern);
      }
      return pattern.test(lower);
    });
  }
}