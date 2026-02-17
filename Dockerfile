FROM node:18-alpine

# Install PM2 globally
RUN npm install -g pm2

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY . .

# Create data and logs directories
RUN mkdir -p data logs

# Expose no ports (bot connects outbound only)

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD pm2 pid solana-trading-bot || exit 1

# Start with PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
