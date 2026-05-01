import { createServer } from './src/core/server.js';
import { loadConfig } from './src/core/config.js';
import { logger } from './src/core/logger.js';
import { loadExtensions } from './src/extensions/loader.js';

async function main() {
  try {
    console.log('\n🚀 Starting Titanium Proxy...\n');
    
    // Load configuration
    const config = await loadConfig();
    
    // Load extensions
    const extensions = await loadExtensions(config.extensionsPath);
    
    // Create and start server
    const server = await createServer(config, extensions);
    
    server.listen(config.port, config.host, () => {
      logger.info('========================================');
      logger.info('  TITANIUM PROXY SERVER v2.0');
      logger.info('========================================');
      logger.info(`  URL: http://${config.host}:${config.port}`);
      logger.info(`  Extensions: ${extensions.length} loaded`);
      logger.info('========================================\n');
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('\nSIGINT received, shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();