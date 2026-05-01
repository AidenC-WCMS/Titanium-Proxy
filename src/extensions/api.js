export class ExtensionAPI {
  constructor(context) {
    this.context = context;
  }
  
  // Logger access
  get logger() {
    return this.context.logger;
  }
  
  // Config access (read-only)
  getConfig(key) {
    return this.context.config[key];
  }
  
  // Auth methods (will be populated in P1)
  async authenticateUser(username, password) {
    if (!this.context.auth) {
      throw new Error('Auth module not loaded (requires P1)');
    }
    const users = await this.context.auth.loadUsers();
    const user = users.users.find(u => u.username === username);
    if (user && await this.context.auth.verifyPassword(password, user.password)) {
      return { success: true, user };
    }
    return { success: false };
  }
  
  async createSession(username) {
    if (!this.context.auth) {
      throw new Error('Auth module not loaded (requires P1)');
    }
    return await this.context.auth.sessions.create(username);
  }
  
  // Storage methods
  async getStorage(namespace) {
    return new ExtensionStorage(namespace, this.context.config.dataPath);
  }
  
  // Proxy methods (will be populated in P1)
  async proxyRequest(url, options = {}) {
    if (!this.context.proxy) {
      throw new Error('Proxy module not loaded (requires P1)');
    }
    return await this.context.proxy.request(url, options);
  }
  
  // Router registration
  registerRoute(path, handler) {
    if (!this.routes) {
      this.routes = new Map();
    }
    this.routes.set(path, handler);
  }
  
  // Event system
  on(event, handler) {
    if (!this.eventHandlers) {
      this.eventHandlers = new Map();
    }
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }
  
  async emit(event, data) {
    if (!this.eventHandlers || !this.eventHandlers.has(event)) {
      return;
    }
    
    for (const handler of this.eventHandlers.get(event)) {
      try {
        await handler(data);
      } catch (error) {
        this.logger.error(`Event handler error (${event}):`, { error: error.message });
      }
    }
  }
}

class ExtensionStorage {
  constructor(namespace, dataPath) {
    this.namespace = namespace;
    this.filePath = join(dataPath, `extension_${namespace}.json`);
  }
  
  async read() {
    try {
      const { readFile } = await import('fs/promises');
      const { existsSync } = await import('fs');
      const { join } = await import('path');
      
      if (!existsSync(this.filePath)) {
        return {};
      }
      
      const data = await readFile(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }
  
  async write(data) {
    const { writeFile } = await import('fs/promises');
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
  
  async get(key) {
    const data = await this.read();
    return data[key];
  }
  
  async set(key, value) {
    const data = await this.read();
    data[key] = value;
    await this.write(data);
  }
  
  async delete(key) {
    const data = await this.read();
    delete data[key];
    await this.write(data);
  }
}