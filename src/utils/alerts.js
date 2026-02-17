const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const axios = require('axios');
const logger = require('./logger');

class AlertManager {
  constructor() {
    this.telegramBot = null;
    this.discordWebhook = null;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    this.enabled = false;
  }

  async initialize() {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    
    if (telegramToken && this.telegramChatId) {
      try {
        this.telegramBot = new TelegramBot(telegramToken, { polling: false });
        this.enabled = true;
        logger.info('✓ Telegram alerts enabled');
      } catch (error) {
        logger.error('Failed to initialize Telegram:', error.message);
      }
    }
    
    if (discordUrl) {
      try {
        this.discordWebhook = new WebhookClient({ url: discordUrl });
        this.enabled = true;
        logger.info('✓ Discord alerts enabled');
      } catch (error) {
        logger.error('Failed to initialize Discord:', error.message);
      }
    }
    
    if (!this.enabled) {
      logger.warn('⚠️  No alert channels configured');
    }
  }

  async sendAlert(title, message) {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}]\n${title}\n\n${message}`;
    
    logger.info(`📢 Alert: ${title}`);
    
    // Telegram
    if (this.telegramBot && this.telegramChatId) {
      try {
        await this.telegramBot.sendMessage(this.telegramChatId, fullMessage);
      } catch (error) {
        logger.error('Failed to send Telegram alert:', error.message);
      }
    }
    
    // Discord
    if (this.discordWebhook) {
      try {
        await this.discordWebhook.send({
          embeds: [{
            title: title,
            description: message,
            timestamp: timestamp,
            color: title.includes('🛑') ? 0xff0000 : 
                   title.includes('✅') ? 0x00ff00 : 0x0099ff
          }]
        });
      } catch (error) {
        logger.error('Failed to send Discord alert:', error.message);
      }
    }
  }
}

module.exports = AlertManager;
