import { logger } from '../../core/logger.js';

export class SecurityModule {
  constructor(config) {
    this.config = config;
    this.rateLimitMap = new Map();
    this.blockedIPs = new Set();
  }
  
  async checkRequest(req, res) {
    // Rate limiting
    const identifier = this.getIdentifier(req);
    if (!this.checkRateLimit(identifier)) {
      logger.warn(`Rate limit exceeded: ${identifier.substring(0, 16)}...`);
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Too many requests. Please try again later.');
      return false;
    }
    
    // IP blocking
    const ip = this.getClientIP(req);
    if (this.blockedIPs.has(ip)) {
      logger.warn(`Blocked IP attempted access: ${ip}`);
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return false;
    }
    
    return true;
  }
  
  checkRateLimit(identifier) {
    const now = Date.now();
    const userLimit = this.rateLimitMap.get(identifier);
    
    if (!userLimit) {
      this.rateLimitMap.set(identifier, { 
        count: 1, 
        resetTime: now + this.config.rateLimitWindow 
      });
      return true;
    }
    
    if (now > userLimit.resetTime) {
      this.rateLimitMap.set(identifier, { 
        count: 1, 
        resetTime: now + this.config.rateLimitWindow 
      });
      return true;
    }
    
    if (userLimit.count >= this.config.maxRequestsPerWindow) {
      return false;
    }
    
    userLimit.count++;
    return true;
  }
  
  getIdentifier(req) {
    return req.headers['x-browser-fingerprint'] || 
           this.getClientIP(req) || 
           'unknown';
  }
  
  getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.headers['x-real-ip'] ||
           req.socket.remoteAddress;
  }
  
  addHeaders(res) {
    const headers = this.getSecurityHeaders();
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }
  
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
  }
  
  getCorsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    };
  }
  
  blockIP(ip) {
    this.blockedIPs.add(ip);
    logger.warn(`IP blocked: ${ip}`);
  }
  
  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    logger.info(`IP unblocked: ${ip}`);
  }
}