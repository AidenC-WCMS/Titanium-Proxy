import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../core/logger.js';

export class GameLoader {
  constructor(config) {
    this.config = config;
    this.gamesFile = join(config.dataPath, 'games.json');
  }
  
  async loadGames() {
    if (!existsSync(this.gamesFile)) {
      logger.warn('games.json not found, creating default...');
      await this.createDefaultGames();
    }
    
    try {
      const data = await readFile(this.gamesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error(`Failed to load games: ${error.message}`);
      return { games: [] };
    }
  }
  
  async saveGames(data) {
    try {
      await writeFile(this.gamesFile, JSON.stringify(data, null, 2));
      logger.info('Games saved successfully');
    } catch (error) {
      logger.error(`Failed to save games: ${error.message}`);
    }
  }
  
  async addGame(game) {
    const games = await this.loadGames();
    
    // Check for duplicate ID
    if (games.games.find(g => g.id === game.id)) {
      throw new Error('Game ID already exists');
    }
    
    // Validate game object
    this.validateGame(game);
    
    games.games.push(game);
    await this.saveGames(games);
    logger.info(`Game added: ${game.name}`);
  }
  
  async removeGame(gameId) {
    const games = await this.loadGames();
    const index = games.games.findIndex(g => g.id === gameId);
    
    if (index === -1) {
      throw new Error('Game not found');
    }
    
    const removed = games.games.splice(index, 1)[0];
    await this.saveGames(games);
    logger.info(`Game removed: ${removed.name}`);
  }
  
  async updateGame(gameId, updates) {
    const games = await this.loadGames();
    const game = games.games.find(g => g.id === gameId);
    
    if (!game) {
      throw new Error('Game not found');
    }
    
    Object.assign(game, updates);
    this.validateGame(game);
    
    await this.saveGames(games);
    logger.info(`Game updated: ${game.name}`);
  }
  
  validateGame(game) {
    if (!game.id || !game.name) {
      throw new Error('Game must have id and name');
    }
    
    if (!game.iframeUrl && !game.html) {
      throw new Error('Game must have either iframeUrl or html property');
    }
    
    if (game.iframeUrl && game.html) {
      throw new Error('Game cannot have both iframeUrl and html properties');
    }
    
    if (game.iframeUrl) {
      try {
        new URL(game.iframeUrl);
      } catch (error) {
        throw new Error('Invalid iframeUrl');
      }
    }
  }
  
  async createDefaultGames() {
    // Ensure data directory exists
    const dataDir = this.config.dataPath;
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }
    
    const defaultGames = {
      games: [
        {
          id: "slope",
          name: "Slope",
          description: "Control a ball rolling down a slope at high speed",
          iframeUrl: "https://slope-game.github.io/roto/slope/index.html",
          icon: "slope.png",
          category: "arcade"
        },
        {
          id: "basket-random",
          name: "Basket Random",
          description: "Chaotic 2-player basketball with ragdoll physics",
          iframeUrl: "https://html5.gamedistribution.com/bf1268dccb5d43e7970bb3edaa54afc8/",
          icon: "basket-random.png",
          category: "sports"
        },
        {
          id: "retro-bowl",
          name: "Retro Bowl",
          description: "Classic American football management game",
          iframeUrl: "https://retrobowl.github.io/game/",
          icon: "retro-bowl.png",
          category: "sports"
        }
      ]
    };
    
    await this.saveGames(defaultGames);
    logger.info('Created default games.json');
  }
}