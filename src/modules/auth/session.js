import crypto from 'crypto';
import { logger } from '../../core/logger.js';

export class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
    this.startCleanup();
  }
  
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, session] of this.sessions.entries()) {
        if (now - session.loginTime > this.config.maxSessionAge) {
          this.sessions.delete(token);
          logger.info(`Session expired: ${session.username}`);
        }
      }
    }, 3600000); // Run every hour
  }
  
  async create(username) {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      username,
      loginTime: Date.now()
    });
    return token;
  }
  
  async verify(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const token = cookies.session;
    
    if (token && this.sessions.has(token)) {
      const session = this.sessions.get(token);
      return {
        authenticated: true,
        username: session.username,
        session
      };
    }
    
    return { authenticated: false };
  }
  
  async destroy(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const token = cookies.session;
    
    if (token && this.sessions.has(token)) {
      const session = this.sessions.get(token);
      this.sessions.delete(token);
      logger.auth(`User logged out: ${session.username}`);
    }
  }
  
  parseCookies(cookieHeader) {
    const cookies = {};
    if (cookieHeader) {
      cookieHeader.split(';').forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
          cookies[name] = value;
        }
      });
    }
    return cookies;
  }
}