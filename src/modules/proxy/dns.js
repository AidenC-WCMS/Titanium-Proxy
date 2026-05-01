import dns from 'dns';
import { promisify } from 'util';
import { logger } from '../../core/logger.js';

const resolve4 = promisify(dns.resolve4);

export class DNSResolver {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }
  
  async resolve(hostname) {
    // Check cache
    if (this.cache.has(hostname)) {
      const cached = this.cache.get(hostname);
      if (Date.now() - cached.timestamp < this.config.dnsCacheTTL) {
        return cached.ip;
      }
      this.cache.delete(hostname);
    }
    
    // Try multiple DNS servers
    for (const dnsServer of this.config.dnsServers) {
      try {
        dns.setServers([dnsServer]);
        const addresses = await resolve4(hostname);
        
        if (addresses && addresses.length > 0) {
          const ip = addresses[0];
          this.cache.set(hostname, { ip, timestamp: Date.now() });
          logger.dns(`Resolved ${hostname} -> ${ip} via ${dnsServer}`);
          return ip;
        }
      } catch (error) {
        // Try next DNS server
        continue;
      }
    }
    
    // Fallback to system DNS
    try {
      const addresses = await resolve4(hostname);
      const ip = addresses[0];
      this.cache.set(hostname, { ip, timestamp: Date.now() });
      return ip;
    } catch (error) {
      logger.error(`DNS resolution completely failed for ${hostname}`);
      return hostname;
    }
  }
  
  clearCache() {
    this.cache.clear();
    logger.info('DNS cache cleared');
  }
  
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([hostname, data]) => ({
        hostname,
        ip: data.ip,
        age: Date.now() - data.timestamp
      }))
    };
  }
}