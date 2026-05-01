import crypto from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../core/logger.js';

export class FingerprintManager {
  constructor(config) {
    this.config = config;
    this.fingerprintsFile = join(config.dataPath, 'fingerprints.json');
  }
  
  async init() {
    // Ensure data directory exists
    const dataDir = this.config.dataPath;
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }
    
    // Create fingerprints file if it doesn't exist
    if (!existsSync(this.fingerprintsFile)) {
      await this.save({ fingerprints: [] });
    }
  }
  
  generate(req) {
    const clientFingerprint = req.headers['x-browser-fingerprint'] || '';
    
    const components = [
      clientFingerprint,
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.headers['accept'] || '',
      req.headers['sec-ch-ua'] || '',
      req.headers['sec-ch-ua-mobile'] || '',
      req.headers['sec-ch-ua-platform'] || '',
    ].join('|');
    
    const hash = crypto.createHash('sha256').update(components).digest('hex');
    
    return {
      hash,
      data: {
        clientFingerprint,
        userAgent: req.headers['user-agent'] || '',
        acceptLanguage: req.headers['accept-language'] || '',
        acceptEncoding: req.headers['accept-encoding'] || '',
        accept: req.headers['accept'] || '',
        secChUa: req.headers['sec-ch-ua'] || '',
        secChUaMobile: req.headers['sec-ch-ua-mobile'] || '',
        secChUaPlatform: req.headers['sec-ch-ua-platform'] || ''
      }
    };
  }
  
  async load() {
    if (!existsSync(this.fingerprintsFile)) {
      return { fingerprints: [] };
    }
    try {
      const data = await readFile(this.fingerprintsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load fingerprints:', { error: error.message });
      return { fingerprints: [] };
    }
  }
  
  async save(data) {
    try {
      await writeFile(this.fingerprintsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save fingerprints:', { error: error.message });
    }
  }
  
  async store(fingerprintHash, fingerprintData, username = null) {
    const fingerprints = await this.load();
    const timestamp = new Date().toISOString();
    
    let existing = fingerprints.fingerprints.find(f => f.hash === fingerprintHash);
    
    if (existing) {
      existing.lastSeen = timestamp;
      existing.seenCount = (existing.seenCount || 1) + 1;
      
      if (username && !existing.users.includes(username)) {
        existing.users.push(username);
      }
      
      if (fingerprintData) {
        existing.data = fingerprintData;
      }
    } else {
      fingerprints.fingerprints.push({
        hash: fingerprintHash,
        data: fingerprintData || {},
        users: username ? [username] : [],
        firstSeen: timestamp,
        lastSeen: timestamp,
        seenCount: 1
      });
    }
    
    await this.save(fingerprints);
    return existing ? 'updated' : 'created';
  }
  
  getClientScript() {
    return `
<script>
(function() {
  function generateFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    
    const fingerprint = {
      canvas: canvas.toDataURL().substring(0, 100),
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages ? navigator.languages.join(',') : '',
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: navigator.deviceMemory || 0,
      screenResolution: screen.width + 'x' + screen.height,
      screenDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      cookies: navigator.cookieEnabled,
      localStorage: !!window.localStorage,
      sessionStorage: !!window.sessionStorage,
      indexedDB: !!window.indexedDB,
      touchSupport: 'ontouchstart' in window
    };
    
    const fingerprintString = JSON.stringify(fingerprint);
    return btoa(fingerprintString).substring(0, 64);
  }
  
  try {
    const fp = generateFingerprint();
    sessionStorage.setItem('browser_fp', fp);
    
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      if (args[1]) {
        args[1].headers = args[1].headers || {};
        args[1].headers['X-Browser-Fingerprint'] = fp;
      } else {
        args[1] = { headers: { 'X-Browser-Fingerprint': fp } };
      }
      return originalFetch.apply(this, args);
    };
    
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(...args) {
      this.addEventListener('readystatechange', function() {
        if (this.readyState === 1) {
          this.setRequestHeader('X-Browser-Fingerprint', fp);
        }
      });
      return originalOpen.apply(this, args);
    };
  } catch(e) {
    console.error('Fingerprinting failed:', e);
  }
})();
</script>`;
  }
}