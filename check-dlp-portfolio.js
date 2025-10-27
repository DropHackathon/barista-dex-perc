const { Connection, PublicKey } = require('@solana/web3.js');

async function checkDlpPortfolio() {
  const connection = new Connection('http://localhost:8899', 'confirmed');

  const routerProgramId = new PublicKey('Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx');
  const slabLpOwner = new PublicKey('4uQeVj5tqW7CpQbaVjRGHCdKvD2DwnzdyiL7gbQjJj7');
  const actualDlp = new PublicKey('FgPPgkcrH4dQGnhkjVrYHJvtgWRKa3QQ1hzxVNM88Y2x');

  console.log('Router Program:', routerProgramId.toBase58());
  console.log('Slab lp_owner:', slabLpOwner.toBase58());
  console.log('Actual DLP keypair:', actualDlp.toBase58());
  console.log('');

  // Derive portfolio PDA for slab's lp_owner
  const [portfolioPdaFromSlab, bumpFromSlab] = PublicKey.findProgramAddressSync(
    [Buffer.from('portfolio'), slabLpOwner.toBuffer()],
    routerProgramId
  );

  console.log('Portfolio PDA derived from slab lp_owner:', portfolioPdaFromSlab.toBase58());
  console.log('  Bump:', bumpFromSlab);

  const accountInfo1 = await connection.getAccountInfo(portfolioPdaFromSlab);
  console.log('  Exists:', accountInfo1 ? `YES (${accountInfo1.lamports} lamports)` : 'NO');

  if (accountInfo1) {
    console.log('  Data length:', accountInfo1.data.length);
    // Read equity from portfolio (at offset after header)
    const equityOffset = 48; // After owner(32) + router_id(32) + bump(1) + padding
    if (accountInfo1.data.length >= equityOffset + 16) {
      const equityLow = accountInfo1.data.readBigUInt64LE(equityOffset);
      const equityHigh = accountInfo1.data.readBigInt64LE(equityOffset + 8);
      console.log('  Equity:', Number(equityLow) / 1_000_000);
    }
  }
  console.log('');

  // Derive portfolio PDA for actual DLP
  const [portfolioPdaFromActual, bumpFromActual] = PublicKey.findProgramAddressSync(
    [Buffer.from('portfolio'), actualDlp.toBuffer()],
    routerProgramId
  );

  console.log('Portfolio PDA derived from actual DLP:', portfolioPdaFromActual.toBase58());
  console.log('  Bump:', bumpFromActual);

  const accountInfo2 = await connection.getAccountInfo(portfolioPdaFromActual);
  console.log('  Exists:', accountInfo2 ? `YES (${accountInfo2.lamports} lamports)` : 'NO');

  if (accountInfo2) {
    console.log('  Data length:', accountInfo2.data.length);
    const equityOffset = 48;
    if (accountInfo2.data.length >= equityOffset + 16) {
      const equityLow = accountInfo2.data.readBigUInt64LE(equityOffset);
      const equityHigh = accountInfo2.data.readBigInt64LE(equityOffset + 8);
      console.log('  Equity:', Number(equityLow) / 1_000_000);
    }
  }
}

checkDlpPortfolio().catch(console.error);
