const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class StateManager {
  constructor() {
    this.stateDir = './data';
    this.stateFile = process.env.STATE_FILE_PATH || './data/bot-state.json';
    this.positionsFile = process.env.POSITIONS_FILE_PATH || './data/positions.json';
    this.startTime = Date.now();
    this.state = {
      lastHeartbeat: null,
      totalTrades: 0,
      totalPnL: 0,
      startTime: this.startTime
    };
  }

  async ensureDirectory() {
    try {
      await fs.mkdir(this.stateDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async loadState() {
    await this.ensureDirectory();
    
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      this.state = JSON.parse(data);
      logger.info('✓ State loaded from file');
      
      // Log recovery if restarting
      if (this.state.lastHeartbeat) {
        const downtime = Math.floor((Date.now() - this.state.lastHeartbeat) / 1000);
        if (downtime > 60) {
          logger.warn(`⚠️  Bot was down for ${downtime} seconds`);
        }
      }
      
    } catch (error) {
      logger.info('ℹ️  No previous state found, starting fresh');
      await this.saveState(this.state);
    }
  }

  async saveState(newState) {
    try {
      this.state = { ...this.state, ...newState, lastHeartbeat: Date.now() };
      await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      logger.error('Failed to save state:', error.message);
    }
  }

  async getPositions() {
    try {
      const data = await fs.readFile(this.positionsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  async savePositions(positions) {
    try {
      await fs.writeFile(this.positionsFile, JSON.stringify(positions, null, 2));
    } catch (error) {
      logger.error('Failed to save positions:', error.message);
    }
  }
}

module.exports = StateManager;
