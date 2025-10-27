const { Connection, PublicKey } = require('@solana/web3.js');

async function checkPortfolios() {
  const connection = new Connection('http://localhost:8899', 'confirmed');

  const routerProgramId = new PublicKey('Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx');
  const slabLpOwner = new PublicKey('4uQeVj5tqW7CpQbaVjRGHCdKvD2DwnzdyiL7gbQjJj7');
  const actualDlp = new PublicKey('FgPPgkcrH4dQGnhkjVrYHJvtgWRKa3QQ1hzxVNM88Y2x');

  console.log('Router Program:', routerProgramId.toBase58());
  console.log('Slab lp_owner:', slabLpOwner.toBase58());
  console.log('Actual DLP keypair:', actualDlp.toBase58());
  console.log('\n=== Portfolio Addresses (using createWithSeed) ===\n');

  // Derive portfolio for slab's lp_owner using createWithSeed
  const portfolioFromSlab = await PublicKey.createWithSeed(
    slabLpOwner,
    'portfolio',
    routerProgramId
  );

  console.log('Portfolio for slab lp_owner:', portfolioFromSlab.toBase58());

  const accountInfo1 = await connection.getAccountInfo(portfolioFromSlab);
  console.log('  Exists:', accountInfo1 ? `YES (${accountInfo1.lamports} lamports, ${accountInfo1.data.length} bytes)` : 'NO');

  if (accountInfo1) {
    const equityOffset = 48;
    if (accountInfo1.data.length >= equityOffset + 16) {
      const equityLow = accountInfo1.data.readBigUInt64LE(equityOffset);
      console.log('  Equity:', Number(equityLow) / 1_000_000);
    }
  }
  console.log('');

  // Derive portfolio for actual DLP using createWithSeed
  const portfolioFromActual = await PublicKey.createWithSeed(
    actualDlp,
    'portfolio',
    routerProgramId
  );

  console.log('Portfolio for actual DLP:', portfolioFromActual.toBase58());

  const accountInfo2 = await connection.getAccountInfo(portfolioFromActual);
  console.log('  Exists:', accountInfo2 ? `YES (${accountInfo2.lamports} lamports, ${accountInfo2.data.length} bytes)` : 'NO');

  if (accountInfo2) {
    const equityOffset = 48;
    if (accountInfo2.data.length >= equityOffset + 16) {
      const equityLow = accountInfo2.data.readBigUInt64LE(equityOffset);
      console.log('  Equity:', Number(equityLow) / 1_000_000);
    }
  }
  console.log('');

  console.log('=== Conclusion ===');
  console.log('The slab expects DLP portfolio at:', portfolioFromSlab.toBase58());
  console.log('The actual DLP portfolio is at:', portfolioFromActual.toBase58());
  console.log('');
  if (portfolioFromSlab.equals(portfolioFromActual)) {
    console.log('✓ MATCH - They are the same!');
  } else {
    console.log('✗ MISMATCH - This is the problem!');
    console.log('\nSolution: The slab was initialized with lp_owner=' + slabLpOwner.toBase58());
    console.log('But you deposited to the DLP at ' + actualDlp.toBase58());
    console.log('\nYou need to either:');
    console.log('1. Deposit to the lp_owner from the slab (' + slabLpOwner.toBase58() + '), or');
    console.log('2. Re-create the slab with lp_owner=' + actualDlp.toBase58());
  }
}

checkPortfolios().catch(console.error);
