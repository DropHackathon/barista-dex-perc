const { PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const targetPubkey = '4uQeVj5tqW7CpQbaVjRGHCdKvD2DwnzdyiL7gbQjJj7';
const keypairDir = process.env.HOME + '/.config/solana';

console.log('Looking for keypair with pubkey:', targetPubkey);
console.log('Searching in:', keypairDir);
console.log('');

const files = fs.readdirSync(keypairDir).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = path.join(keypairDir, file);

  try {
    const keypairData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const publicKeyBytes = keypairData.slice(32, 64);
    const pubkey = new PublicKey(publicKeyBytes);

    console.log(`${file}: ${pubkey.toBase58()}`);

    if (pubkey.toBase58() === targetPubkey) {
      console.log('\n✓ FOUND! Keypair file:', filePath);
      process.exit(0);
    }
  } catch (e) {
    console.log(`${file}: ERROR - ${e.message}`);
  }
}

console.log('\n✗ NOT FOUND - The slab was initialized with an lp_owner that doesn\'t match any local keypair');
console.log('\nYou need to either:');
console.log('1. Find/create the keypair for', targetPubkey);
console.log('2. Re-initialize the slab with lp_owner=FgPPgkcrH4dQGnhkjVrYHJvtgWRKa3QQ1hzxVNM88Y2x (dlp-wallet.json)');
