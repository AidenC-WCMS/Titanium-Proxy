import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../core/logger.js';

export async function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
    logger.info(`Created directory: ${dirPath}`);
  }
}

export async function readJSON(filePath) {
  try {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to read JSON from ${filePath}: ${error.message}`);
    return null;
  }
}

export async function writeJSON(filePath, data) {
  try {
    await ensureDir(dirname(filePath));
    await writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    logger.error(`Failed to write JSON to ${filePath}: ${error.message}`);
    return false;
  }
}

export async function listFiles(dirPath, extension = null) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    let files = entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
    
    if (extension) {
      files = files.filter(file => file.endsWith(extension));
    }
    
    return files;
  } catch (error) {
    logger.error(`Failed to list files in ${dirPath}: ${error.message}`);
    return [];
  }
}

export async function getFileStats(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    logger.error(`Failed to get stats for ${filePath}: ${error.message}`);
    return null;
  }
}

export async function fileExists(filePath) {
  return existsSync(filePath);
}

export async function copyFile(source, destination) {
  try {
    const data = await readFile(source);
    await ensureDir(dirname(destination));
    await writeFile(destination, data);
    return true;
  } catch (error) {
    logger.error(`Failed to copy ${source} to ${destination}: ${error.message}`);
    return false;
  }
}