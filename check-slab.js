const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

async function checkSlab() {
  const connection = new Connection('http://localhost:8899', 'confirmed');
  const slabMarket = new PublicKey('Kbu5MAnPuCy9cuRrJDgrC1SB3XdUmnMh3nGwdei8mVU');

  console.log('Fetching slab account...');
  const accountInfo = await connection.getAccountInfo(slabMarket);

  if (!accountInfo) {
    console.log('ERROR: Slab account not found');
    return;
  }

  console.log(`Slab account data length: ${accountInfo.data.length}`);

  // Read lp_owner from offset 8 (after 8-byte discriminator)
  const lpOwnerBytes = accountInfo.data.slice(8, 40);
  const lpOwner = new PublicKey(lpOwnerBytes);

  console.log('\nSlab lp_owner:', lpOwner.toBase58());

  // Load DLP keypair
  const dlpKeypairPath = process.env.HOME + '/.config/solana/dlp-wallet.json';
  const dlpKeypairData = JSON.parse(fs.readFileSync(dlpKeypairPath, 'utf8'));
  const dlpPubkeyFromKeypair = PublicKey.unique(); // We'll compute it from the keypair

  // The keypair JSON is an array of bytes [secretKey (64 bytes)]
  // Public key is the last 32 bytes of the secret key
  const publicKeyBytes = dlpKeypairData.slice(32, 64);
  const dlpPubkey = new PublicKey(publicKeyBytes);

  console.log('DLP keypair pubkey:', dlpPubkey.toBase58());
  console.log('\nMatch:', lpOwner.equals(dlpPubkey) ? '✓ YES' : '✗ NO');
}

checkSlab().catch(console.error);
