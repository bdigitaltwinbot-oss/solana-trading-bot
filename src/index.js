const dotenv = require('dotenv');
dotenv.config();

const SolanaTrader = require('./trader');
const logger = require('./utils/logger');

async function main() {
  logger.info('Starting Solana Trading Bot...');
  
  // Safety check - ensure trading is explicitly enabled
  if (process.env.ENABLE_TRADING !== 'true') {
    logger.warn('⚠️  Trading is DISABLED. Set ENABLE_TRADING=true to enable live trading.');
    logger.info('Running in DRY RUN mode (no real trades will be executed)');
  }
  
  const trader = new SolanaTrader();
  
  try {
    await trader.initialize();
    logger.info('Bot initialized successfully');
    
    // Start trading loop
    await trader.start();
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
