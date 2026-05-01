import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { logger } from '../core/logger.js';

export async function loadExtensions(extensionsPath) {
  const extensions = [];
  
  if (!existsSync(extensionsPath)) {
    logger.warn(`Extensions directory not found: ${extensionsPath}`);
    return extensions;
  }
  
  try {
    const entries = await readdir(extensionsPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith('.ext')) {
        continue;
      }
      
      const extPath = join(extensionsPath, entry.name);
      const manifestPath = join(extPath, 'manifest.json');
      
      try {
        // Load manifest
        if (!existsSync(manifestPath)) {
          logger.warn(`Extension ${entry.name} missing manifest.json`);
          continue;
        }
        
        const manifestData = await readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestData);
        
        // Validate manifest
        if (!manifest.name || !manifest.version || !manifest.entry) {
          logger.error(`Invalid manifest for extension: ${entry.name}`);
          continue;
        }
        
        // Load extension module
        const extensionPath = join(extPath, manifest.entry);
        if (!existsSync(extensionPath)) {
          logger.error(`Extension entry point not found: ${extensionPath}`);
          continue;
        }
        
        const extensionUrl = pathToFileURL(extensionPath).href;
        const extensionModule = await import(extensionUrl);
        
        // Validate extension exports
        if (!extensionModule.default) {
          logger.error(`Extension ${manifest.name} must have a default export`);
          continue;
        }
        
        extensions.push({
          manifest,
          path: extPath,
          ...extensionModule.default
        });
        
        logger.success(`Loaded extension: ${manifest.name} v${manifest.version}`);
        
      } catch (error) {
        logger.error(`Failed to load extension ${entry.name}:`, { error: error.message });
      }
    }
  } catch (error) {
    logger.error(`Failed to read extensions directory:`, { error: error.message });
  }
  
  return extensions;
}