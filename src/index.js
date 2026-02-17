const dotenv = require('dotenv');
dotenv.config();

const MomentumTrader = require('./trader');
const logger = require('./utils/logger');

let trader = null;

async function main() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  Solana Momentum Trading Bot v2.0');
  logger.info('═══════════════════════════════════════════\n');
  
  trader = new MomentumTrader();
  
  try {
    await trader.initialize();
    await trader.start();
  } catch (error) {
    logger.error('Fatal error:', error);
    
    // Send emergency alert
    if (trader.alertManager) {
      await trader.alertManager.sendAlert('🛑 BOT CRASHED', 
        `Error: ${error.message}\nRestarting...`);
    }
    
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n⚠️  SIGINT received, shutting down gracefully...');
  if (trader) {
    trader.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n⚠️  SIGTERM received, shutting down gracefully...');
  if (trader) {
    trader.stop();
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', error);
  if (trader && trader.alertManager) {
    await trader.alertManager.sendAlert('🛑 UNCAUGHT EXCEPTION', 
      `Error: ${error.message}\nStack: ${error.stack}`);
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (trader && trader.alertManager) {
    await trader.alertManager.sendAlert('🛑 UNHANDLED REJECTION', 
      `Reason: ${reason}`);
  }
});

main();
