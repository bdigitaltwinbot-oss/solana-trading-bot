# Solana Momentum Trading Bot v2.0

High-frequency momentum trading bot for Solana using Jupiter DEX.

## Features

- **Strategy**: Momentum trading on established tokens (>$1M liquidity, >24h old)
- **Entry Criteria**: Strong buy volume, breaking resistance, positive sentiment
- **Risk Management**: Strict position sizing, stop-loss, portfolio stops
- **Monitoring**: Continuous daemon with heartbeat logs
- **Alerts**: Discord/Telegram notifications

## Quick Start

### 1. Generate Wallet
```bash
npm run wallet:generate
```

**Fund the wallet:**
- Send **0.1 SOL** for gas fees
- Send **$500 USDC** for trading

Public key will be displayed after generation.

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Bot

**Development:**
```bash
npm start
```

**Production (Daemon):**
```bash
npm run start:daemon
```

**Docker:**
```bash
npm run docker:build
npm run docker:run
```

## Configuration

### Risk Parameters

| Setting | Value | Description |
|---------|-------|-------------|
| Starting Capital | $500 USDC | Initial trading capital |
| Max Position | $50 (10%) | Per-trade limit |
| Max Positions | 3 | Simultaneous trades |
| Stop Loss | -15% | Per-trade stop |
| Take Profit | +30% | Per-trade target |
| Portfolio Stop | -30% ($150) | Emergency shutdown |

### Monitoring

- Market scan: Every 10-30 seconds
- Position check: Every 10 seconds
- Heartbeat log: Every 5 minutes
- State persistence: Automatic

## Documentation

- [trades.md](trades.md) - Trade history
- [lessons.md](lessons.md) - Learnings
- [research.md](research.md) - Strategy research

## Commands

```bash
npm run wallet:balance    # Check wallet balance
npm run logs             # View bot logs
npm run stop             # Stop the bot
npm run restart          # Restart the bot
```

## Safety

- Bot starts in **DRY RUN** mode (set `ENABLE_TRADING=true` for live)
- All private keys in `.env` and `wallet.json` (never committed)
- Automatic restart on crash
- State survives restarts

## Alert Channels

Configure in `.env`:
- Telegram bot token & chat ID
- Discord webhook URL

## License

MIT
