import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

class Logger {
  constructor() {
    this.logsPath = './logs';
    this.enableFileLogging = true;
    this.init();
  }
  
  async init() {
    try {
      if (!existsSync(this.logsPath)) {
        await mkdir(this.logsPath, { recursive: true });
      }
    } catch (error) {
      console.warn('Failed to create logs directory:', error.message);
      this.enableFileLogging = false;
    }
  }
  
  format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
  }
  
  async write(level, message, meta) {
    const formatted = this.format(level, message, meta);
    console.log(formatted.trim());
    
    // Async file logging
    if (this.enableFileLogging) {
      const logFile = join(this.logsPath, `${new Date().toISOString().split('T')[0]}.log`);
      try {
        await appendFile(logFile, formatted);
      } catch (error) {
        // Silently fail if we can't write to log file
      }
    }
  }
  
  info(message, meta) {
    return this.write('INFO', message, meta);
  }
  
  success(message, meta) {
    return this.write('SUCCESS', message, meta);
  }
  
  warn(message, meta) {
    return this.write('WARN', message, meta);
  }
  
  error(message, meta) {
    return this.write('ERROR', message, meta);
  }
  
  auth(message, meta) {
    return this.write('AUTH', message, meta);
  }
  
  proxy(message, meta) {
    return this.write('PROXY', message, meta);
  }
  
  extension(message, meta) {
    return this.write('EXTENSION', message, meta);
  }
  
  dns(message, meta) {
    return this.write('DNS', message, meta);
  }
  
  stream(message, meta) {
    return this.write('STREAM', message, meta);
  }
}

export const logger = new Logger();