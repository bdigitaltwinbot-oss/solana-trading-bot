const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const logger = require('./utils/logger');
const AlertManager = require('./utils/alerts');
const StateManager = require('./utils/state');

class MomentumTrader {
  constructor() {
    this.connection = null;
    this.wallet = null;
    this.alertManager = new AlertManager();
    this.stateManager = new StateManager();
    this.isRunning = false;
    this.lastHeartbeat = Date.now();
    this.positions = [];
    this.dailyStats = {
      trades: 0,
      profit: 0,
      loss: 0,
      date: new Date().toDateString()
    };
    
    // Risk parameters
    this.config = {
      startingCapital: parseFloat(process.env.STARTING_CAPITAL_USD) || 500,
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_USD) || 50,
      maxPositions: parseInt(process.env.MAX_POSITIONS) || 3,
      stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT) || 15,
      takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT) || 30,
      portfolioStopLoss: parseFloat(process.env.PORTFOLIO_STOP_LOSS_PERCENT) || 30,
      minLiquidity: parseFloat(process.env.MIN_LIQUIDITY_USD) || 1000000,
      minTokenAge: parseInt(process.env.MIN_TOKEN_AGE_HOURS) || 24,
      marketScanInterval: parseInt(process.env.MARKET_SCAN_INTERVAL_MS) || 30000,
      positionCheckInterval: parseInt(process.env.POSITION_CHECK_INTERVAL_MS) || 10000,
      heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 300000,
      enableTrading: process.env.ENABLE_TRADING === 'true',
      dryRun: process.env.DRY_RUN !== 'false'
    };
    
    this.portfolioValue = this.config.startingCapital;
    this.totalPnL = 0;
  }

  async initialize() {
    logger.info('═══════════════════════════════════════════');
    logger.info('  Solana Momentum Trading Bot v2.0');
    logger.info('═══════════════════════════════════════════');
    
    // Initialize Solana connection
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
    logger.info(`Connected to Solana: ${rpcUrl}`);
    
    // Load wallet
    await this.loadWallet();
    
    // Load state
    await this.stateManager.loadState();
    this.positions = await this.stateManager.getPositions();
    
    // Check balance
    await this.checkBalance();
    
    // Setup alerts
    await this.alertManager.initialize();
    
    // Log configuration
    logger.info('\n📊 Configuration:');
    logger.info(`  Starting Capital: $${this.config.startingCapital}`);
    logger.info(`  Max Position: $${this.config.maxPositionSize}`);
    logger.info(`  Max Positions: ${this.config.maxPositions}`);
    logger.info(`  Stop Loss: ${this.config.stopLossPercent}%`);
    logger.info(`  Take Profit: ${this.config.takeProfitPercent}%`);
    logger.info(`  Trading Mode: ${this.config.enableTrading ? 'LIVE' : 'DRY RUN'}`);
    
    if (!this.config.enableTrading) {
      logger.warn('\n⚠️  TRADING IS DISABLED');
      logger.warn('   Set ENABLE_TRADING=true in .env to enable live trading');
    }
    
    await this.alertManager.sendAlert('🚀 Trading Bot Initialized', 
      `Mode: ${this.config.enableTrading ? 'LIVE' : 'DRY RUN'}\n` +
      `Wallet: ${this.wallet.publicKey.toBase58().slice(0, 8)}...\n` +
      `Max Positions: ${this.config.maxPositions}\n` +
      `Capital: $${this.config.startingCapital}`
    );
    
    logger.info('\n✓ Initialization complete');
  }

  async loadWallet() {
    try {
      // Try wallet.json first
      const walletPath = process.env.WALLET_PATH || './wallet.json';
      const walletData = await fs.readFile(walletPath, 'utf8');
      const walletJson = JSON.parse(walletData);
      
      const secretKey = Buffer.from(walletJson.privateKey, 'base64');
      this.wallet = Keypair.fromSecretKey(secretKey);
      
      logger.info(`\n🔑 Wallet loaded: ${this.wallet.publicKey.toBase58()}`);
      
    } catch (error) {
      // Fallback to env variable
      const privateKey = process.env.SOLANA_PRIVATE_KEY;
      if (privateKey) {
        const secretKey = Buffer.from(privateKey, 'base64');
        this.wallet = Keypair.fromSecretKey(secretKey);
        logger.info(`\n🔑 Wallet loaded from env: ${this.wallet.publicKey.toBase58()}`);
      } else {
        throw new Error('No wallet configured. Run: npm run wallet:generate');
      }
    }
  }

  async checkBalance() {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      const solBalance = balance / 1e9;
      
      logger.info(`\n💰 Wallet Balance:`);
      logger.info(`   SOL: ${solBalance.toFixed(4)}`);
      
      if (solBalance < 0.05) {
        logger.warn('⚠️  Low SOL balance. Fund wallet with at least 0.1 SOL for gas.');
      }
      
      // Check USDC balance
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const tokenAccount = await getAssociatedTokenAddress(usdcMint, this.wallet.publicKey);
      
      try {
        const account = await getAccount(this.connection, tokenAccount);
        const usdcBalance = Number(account.amount) / 1e6;
        logger.info(`   USDC: ${usdcBalance.toFixed(2)}`);
        this.portfolioValue = usdcBalance;
      } catch (e) {
        logger.info(`   USDC: 0 (Token account not created)`);
      }
      
    } catch (error) {
      logger.error('Error checking balance:', error.message);
    }
  }

  async start() {
    this.isRunning = true;
    logger.info('\n▶️  Starting trading loops...\n');
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Start position monitor
    this.startPositionMonitor();
    
    // Start market scanner
    await this.marketScannerLoop();
  }

  startHeartbeat() {
    setInterval(async () => {
      this.lastHeartbeat = Date.now();
      const uptime = Math.floor((Date.now() - this.stateManager.startTime) / 1000 / 60);
      
      logger.info(`💓 Heartbeat | Uptime: ${uptime}m | Positions: ${this.positions.length} | PnL: $${this.totalPnL.toFixed(2)}`);
      
      await this.stateManager.saveState({
        lastHeartbeat: this.lastHeartbeat,
        positions: this.positions,
        totalPnL: this.totalPnL,
        portfolioValue: this.portfolioValue
      });
      
    }, this.config.heartbeatInterval);
  }

  startPositionMonitor() {
    setInterval(async () => {
      if (this.positions.length === 0) return;
      
      await this.checkPositions();
      
    }, this.config.positionCheckInterval);
  }

  async marketScannerLoop() {
    while (this.isRunning) {
      try {
        await this.scanMarket();
      } catch (error) {
        logger.error('Error in market scan:', error.message);
      }
      
      // Wait before next scan
      await this.sleep(this.config.marketScanInterval);
    }
  }

  async scanMarket() {
    // Reset daily stats if new day
    if (new Date().toDateString() !== this.dailyStats.date) {
      this.dailyStats = { trades: 0, profit: 0, loss: 0, date: new Date().toDateString() };
    }
    
    // Check if we've hit daily trade limit
    if (this.dailyStats.trades >= parseInt(process.env.MAX_DAILY_TRADES || 10)) {
      return;
    }
    
    // Check portfolio stop loss
    const portfolioLoss = (this.totalPnL / this.config.startingCapital) * 100;
    if (portfolioLoss <= -this.config.portfolioStopLoss) {
      logger.error(`🛑 PORTFOLIO STOP LOSS HIT: ${portfolioLoss.toFixed(2)}%`);
      await this.alertManager.sendAlert('🛑 EMERGENCY STOP', 
        `Portfolio loss: ${portfolioLoss.toFixed(2)}%\nStopping bot.`);
      this.stop();
      return;
    }
    
    // Check max positions
    if (this.positions.length >= this.config.maxPositions) {
      return;
    }
    
    logger.debug('Scanning market for opportunities...');
    
    // Get trending tokens from Jupiter
    const opportunities = await this.findOpportunities();
    
    for (const opp of opportunities) {
      if (this.positions.length >= this.config.maxPositions) break;
      if (this.dailyStats.trades >= parseInt(process.env.MAX_DAILY_TRADES || 10)) break;
      
      // Check if already in position
      if (this.positions.find(p => p.token === opp.token)) continue;
      
      await this.enterPosition(opp);
    }
  }

  async findOpportunities() {
    const opportunities = [];
    
    try {
      // Get top tokens from Jupiter
      const response = await axios.get('https://token.jup.ag/strict');
      const tokens = response.data.slice(0, 50); // Top 50 tokens
      
      for (const token of tokens) {
        try {
          // Check liquidity
          if (token.dailyVolume < this.config.minLiquidity) continue;
          
          // Get price data
          const priceData = await this.getTokenMetrics(token.address);
          if (!priceData) continue;
          
          // Check momentum criteria
          const momentum = this.calculateMomentum(priceData);
          
          if (momentum.score > this.config.momentumThreshold) {
            opportunities.push({
              token: token.address,
              symbol: token.symbol,
              name: token.name,
              price: priceData.price,
              momentum: momentum.score,
              volume24h: token.dailyVolume,
              reason: momentum.reasons
            });
          }
          
        } catch (e) {
          continue;
        }
      }
      
    } catch (error) {
      logger.error('Error fetching opportunities:', error.message);
    }
    
    // Sort by momentum score
    return opportunities.sort((a, b) => b.momentum - a.momentum).slice(0, 5);
  }

  async getTokenMetrics(tokenAddress) {
    try {
      const priceResponse = await axios.get(
        `https://price.jup.ag/v4/price?ids=${tokenAddress}`
      );
      
      const price = priceResponse.data.data[tokenAddress]?.price;
      if (!price) return null;
      
      // Get additional metrics (this would need more data sources in production)
      return {
        price: price,
        volume24h: 0, // Would need additional API
        priceChange24h: 0, // Would need historical data
        liquidity: 0
      };
      
    } catch (error) {
      return null;
    }
  }

  calculateMomentum(metrics) {
    const reasons = [];
    let score = 0;
    
    // Price momentum (would use historical data in production)
    if (metrics.priceChange24h > 5) {
      score += 1;
      reasons.push('Positive 24h price action');
    }
    
    // Volume check
    if (metrics.volume24h > this.config.minLiquidity) {
      score += 0.5;
      reasons.push('High liquidity');
    }
    
    return { score, reasons };
  }

  async enterPosition(opportunity) {
    const positionSize = Math.min(
      this.config.maxPositionSize,
      this.portfolioValue * 0.1
    );
    
    logger.info(`\n📈 ENTERING POSITION:`);
    logger.info(`   Token: ${opportunity.symbol} (${opportunity.token.slice(0, 8)}...)`);
    logger.info(`   Price: $${opportunity.price.toFixed(6)}`);
    logger.info(`   Size: $${positionSize.toFixed(2)}`);
    logger.info(`   Momentum: ${opportunity.momentum.toFixed(2)}`);
    logger.info(`   Reasons: ${opportunity.reason.join(', ')}`);
    
    if (this.config.dryRun || !this.config.enableTrading) {
      logger.info('   [DRY RUN - No trade executed]');
      return;
    }
    
    try {
      // Execute trade via Jupiter
      const tx = await this.executeJupiterSwap(
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        opportunity.token,
        positionSize
      );
      
      if (tx) {
        const position = {
          id: Date.now(),
          token: opportunity.token,
          symbol: opportunity.symbol,
          entryPrice: opportunity.price,
          entryTime: new Date().toISOString(),
          size: positionSize,
          txHash: tx,
          stopLoss: opportunity.price * (1 - this.config.stopLossPercent / 100),
          takeProfit: opportunity.price * (1 + this.config.takeProfitPercent / 100)
        };
        
        this.positions.push(position);
        await this.stateManager.savePositions(this.positions);
        
        this.dailyStats.trades++;
        
        await this.alertManager.sendAlert('📈 Position Opened',
          `${opportunity.symbol} @ $${opportunity.price.toFixed(6)}\n` +
          `Size: $${positionSize.toFixed(2)}\n` +
          `Stop: $${position.stopLoss.toFixed(6)}\n` +
          `Target: $${position.takeProfit.toFixed(6)}`
        );
        
        logger.info('   ✓ Position opened successfully');
      }
      
    } catch (error) {
      logger.error('   ✗ Failed to open position:', error.message);
    }
  }

  async checkPositions() {
    for (let i = this.positions.length - 1; i >= 0; i--) {
      const position = this.positions[i];
      
      try {
        const currentPrice = await this.getTokenPrice(position.token);
        if (!currentPrice) continue;
        
        const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const pnlUsd = (pnlPercent / 100) * position.size;
        
        logger.debug(`${position.symbol}: $${currentPrice.toFixed(6)} (${pnlPercent.toFixed(2)}%)`);
        
        // Check stop loss
        if (currentPrice <= position.stopLoss) {
          await this.closePosition(position, currentPrice, 'STOP_LOSS');
          this.positions.splice(i, 1);
          continue;
        }
        
        // Check take profit
        if (currentPrice >= position.takeProfit) {
          await this.closePosition(position, currentPrice, 'TAKE_PROFIT');
          this.positions.splice(i, 1);
          continue;
        }
        
      } catch (error) {
        logger.error(`Error checking position ${position.symbol}:`, error.message);
      }
    }
    
    if (this.positions.length > 0) {
      await this.stateManager.savePositions(this.positions);
    }
  }

  async closePosition(position, exitPrice, reason) {
    const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    const pnlUsd = (pnlPercent / 100) * position.size;
    
    logger.info(`\n📉 CLOSING POSITION (${reason}):`);
    logger.info(`   Token: ${position.symbol}`);
    logger.info(`   Entry: $${position.entryPrice.toFixed(6)}`);
    logger.info(`   Exit: $${exitPrice.toFixed(6)}`);
    logger.info(`   PnL: ${pnlPercent.toFixed(2)}% ($${pnlUsd.toFixed(2)})`);
    
    if (!this.config.dryRun && this.config.enableTrading) {
      // Execute closing trade
      try {
        await this.executeJupiterSwap(
          position.token,
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          position.size
        );
      } catch (error) {
        logger.error('   Error closing position:', error.message);
      }
    }
    
    // Update stats
    this.totalPnL += pnlUsd;
    if (pnlUsd > 0) {
      this.dailyStats.profit += pnlUsd;
    } else {
      this.dailyStats.loss += Math.abs(pnlUsd);
    }
    
    // Log trade
    await this.logTrade({
      ...position,
      exitPrice,
      exitTime: new Date().toISOString(),
      pnlPercent,
      pnlUsd,
      reason
    });
    
    await this.alertManager.sendAlert(
      reason === 'TAKE_PROFIT' ? '✅ Take Profit Hit' : '⛔ Stop Loss Hit',
      `${position.symbol}\nPnL: ${pnlPercent.toFixed(2)}% ($${pnlUsd.toFixed(2)})`
    );
  }

  async executeJupiterSwap(inputMint, outputMint, amountUsd) {
    // This is a placeholder - actual implementation would use Jupiter SDK
    logger.info('   Executing Jupiter swap...');
    
    // In production, this would:
    // 1. Get quote from Jupiter
    // 2. Create swap transaction
    // 3. Sign with wallet
    // 4. Send and confirm
    
    return 'simulated-tx-hash';
  }

  async getTokenPrice(tokenAddress) {
    try {
      const response = await axios.get(
        `https://price.jup.ag/v4/price?ids=${tokenAddress}`
      );
      return response.data.data[tokenAddress]?.price;
    } catch (error) {
      return null;
    }
  }

  async logTrade(trade) {
    try {
      const tradesFile = process.env.TRADES_FILE_PATH || './data/trades.json';
      let trades = [];
      
      try {
        const data = await fs.readFile(tradesFile, 'utf8');
        trades = JSON.parse(data);
      } catch (e) {
        // File doesn't exist yet
      }
      
      trades.push(trade);
      await fs.writeFile(tradesFile, JSON.stringify(trades, null, 2));
      
    } catch (error) {
      logger.error('Error logging trade:', error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    logger.info('\n🛑 Stopping trading bot...');
    this.isRunning = false;
    this.stateManager.saveState({
      positions: this.positions,
      totalPnL: this.totalPnL,
      portfolioValue: this.portfolioValue
    });
  }
}

module.exports = MomentumTrader;
