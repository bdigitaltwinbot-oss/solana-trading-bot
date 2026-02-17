const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

async function checkBalance() {
  try {
    // Load wallet
    const walletData = JSON.parse(fs.readFileSync('./wallet.json', 'utf8'));
    const publicKey = new PublicKey(walletData.publicKey);
    
    console.log('═══════════════════════════════════════════');
    console.log('  Wallet Balance Check');
    console.log('═══════════════════════════════════════════\n');
    
    console.log(`Public Key: ${publicKey.toBase58()}\n`);
    
    // Connect to Solana
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    
    // Check SOL balance
    const solBalance = await connection.getBalance(publicKey);
    console.log(`SOL Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);
    
    if (solBalance < 0.05 * 1e9) {
      console.log('⚠️  LOW SOL: Fund with at least 0.1 SOL for gas fees');
    }
    
    // Check USDC
    const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const tokenAccount = await getAssociatedTokenAddress(usdcMint, publicKey);
    
    try {
      const account = await getAccount(connection, tokenAccount);
      const usdcBalance = Number(account.amount) / 1e6;
      console.log(`USDC Balance: ${usdcBalance.toFixed(2)} USDC`);
    } catch (e) {
      console.log('USDC Balance: 0 (Token account not created)');
    }
    
    console.log('\n═══════════════════════════════════════════');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkBalance();
