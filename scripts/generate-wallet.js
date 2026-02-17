const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

console.log('Generating Solana Trading Bot Wallet...\n');

// Generate new wallet
const wallet = Keypair.generate();

const walletData = {
  publicKey: wallet.publicKey.toBase58(),
  privateKey: Buffer.from(wallet.secretKey).toString('base64'),
  createdAt: new Date().toISOString()
};

// Save to file
const walletPath = path.join(__dirname, '..', 'wallet.json');
fs.writeFileSync(walletPath, JSON.stringify(walletData, null, 2));

console.log('✓ Wallet Generated!\n');
console.log('═══════════════════════════════════════════════════');
console.log('PUBLIC KEY (Send USDC here):');
console.log(wallet.publicKey.toBase58());
console.log('═══════════════════════════════════════════════════\n');
console.log('Private Key saved to: wallet.json');
console.log('\n⚠️  IMPORTANT:');
console.log('1. Fund this wallet with SOL for gas fees (0.05-0.1 SOL)');
console.log('2. Fund with USDC for trading ($500 as specified)');
console.log('3. Backup wallet.json securely');
console.log('4. Never commit wallet.json to git');
