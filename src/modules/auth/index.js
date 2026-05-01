import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../core/logger.js';
import { SessionManager } from './session.js';
import { FingerprintManager } from './fingerprint.js';

export class AuthModule {
  constructor(config) {
    this.config = config;
    this.usersFile = join(config.dataPath, 'users.json');
    this.sessions = new SessionManager(config);
    this.fingerprint = new FingerprintManager(config);
  }
  
  async init() {
    // Ensure data directory exists
    const dataDir = this.config.dataPath;
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }
    
    // Initialize fingerprinting
    if (this.config.enableFingerprinting) {
      await this.fingerprint.init();
    }
    
    // Create users file if it doesn't exist
    if (!existsSync(this.usersFile)) {
      await this.saveUsers({ users: [] });
      logger.warn('No users found. Run: node scripts/add-user.js');
    }
  }
  
  async loadUsers() {
    if (!existsSync(this.usersFile)) {
      return { users: [] };
    }
    try {
      const data = await readFile(this.usersFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load users:', { error: error.message });
      return { users: [] };
    }
  }
  
  async saveUsers(data) {
    try {
      await writeFile(this.usersFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save users:', { error: error.message });
    }
  }
  
  async hashPassword(password) {
    return await bcrypt.hash(password, this.config.bcryptRounds);
  }
  
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }
  
  async createUser(username, password) {
    const users = await this.loadUsers();
    
    if (users.users.find(u => u.username === username)) {
      throw new Error('User already exists');
    }
    
    const hashedPassword = await this.hashPassword(password);
    users.users.push({
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      role: users.users.length === 0 ? 'admin' : 'user'
    });
    
    await this.saveUsers(users);
    logger.info(`User created: ${username}`);
  }
  
  async authenticate(req) {
    // Check session first
    const sessionAuth = await this.sessions.verify(req);
    if (sessionAuth.authenticated) {
      return sessionAuth;
    }
    
    // Check Basic Auth
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [username, password] = credentials.split(':');
        
        const users = await this.loadUsers();
        const user = users.users.find(u => u.username === username);
        
        if (user && await this.verifyPassword(password, user.password)) {
          return { authenticated: true, username };
        }
      } catch (error) {
        logger.error('Basic auth failed:', { error: error.message });
      }
    }
    
    return { authenticated: false };
  }
  
  async handleRoute(req, res, parsedUrl) {
    // Login page
    if (parsedUrl.pathname === '/login' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getLoginPage());
      return true;
    }
    
    // Login POST
    if (parsedUrl.pathname === '/login' && req.method === 'POST') {
      await this.handleLogin(req, res);
      return true;
    }
    
    // Logout
    if (parsedUrl.pathname === '/logout') {
      await this.sessions.destroy(req);
      res.writeHead(302, {
        'Location': '/login',
        'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0'
      });
      res.end();
      return true;
    }
    
    return false;
  }
  
  async handleLogin(req, res) {
    let body = '';
    
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 1024) {
        res.writeHead(413, { 'Content-Type': 'text/plain' });
        res.end('Payload too large');
        return;
      }
    }
    
    const params = new URLSearchParams(body);
    const username = params.get('username');
    const password = params.get('password');
    
    if (!username || !password) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getLoginPage('Invalid credentials'));
      return;
    }
    
    const users = await this.loadUsers();
    const user = users.users.find(u => u.username === username);
    
    if (user && await this.verifyPassword(password, user.password)) {
      const token = await this.sessions.create(username);
      
      // Track fingerprint
      if (this.config.enableFingerprinting) {
        const fp = this.fingerprint.generate(req);
        await this.fingerprint.store(fp.hash, fp.data, username);
      }
      
      res.writeHead(302, {
        'Location': '/',
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${this.config.maxSessionAge / 1000}`
      });
      res.end();
      logger.auth(`User logged in: ${username}`);
    } else {
      // Add delay to prevent brute force
      await new Promise(resolve => setTimeout(resolve, 1000));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getLoginPage('Invalid username or password'));
      logger.auth(`Failed login attempt: ${username || 'unknown'}`);
    }
  }
  
  getLoginPage(error = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Titanium Proxy - Login</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0a0a0f;
      color: #e8e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 400px;
      padding: 40px;
      background: #1a1a2e;
      border-radius: 16px;
      border: 1px solid #2a2a3e;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h1 {
      font-size: 32px;
      font-weight: 900;
      text-align: center;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #4a9eff, #667eea);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      text-align: center;
      color: #a0a0b0;
      margin-bottom: 32px;
      font-size: 14px;
    }
    .error {
      background: #2e1a1a;
      border-left: 4px solid #ff6b6b;
      padding: 12px;
      margin-bottom: 20px;
      border-radius: 4px;
      color: #ff6b6b;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 14px;
      color: #e8e8f0;
    }
    input {
      width: 100%;
      padding: 12px 16px;
      background: #0a0a0f;
      border: 1px solid #2a2a3e;
      border-radius: 8px;
      color: #e8e8f0;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #4a9eff;
      box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.1);
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #4a9eff, #667eea);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
      font-family: 'Inter', sans-serif;
    }
    button:hover {
      opacity: 0.9;
    }
    button:active {
      transform: scale(0.98);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>TITANIUM PROXY</h1>
    <p class="subtitle">Access Control System</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/login">
      <div class="form-group">
        <label for="username">USERNAME</label>
        <input type="text" id="username" name="username" required autofocus>
      </div>
      <div class="form-group">
        <label for="password">PASSWORD</label>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit">DEPLOY ACCESS</button>
    </form>
  </div>
</body>
</html>`;
  }
}