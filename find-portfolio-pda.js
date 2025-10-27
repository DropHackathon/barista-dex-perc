const { Connection, PublicKey } = require('@solana/web3.js');

async function findPortfolioPda() {
  const connection = new Connection('http://localhost:8899', 'confirmed');

  const routerProgramId = new PublicKey('Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx');
  const actualDlp = new PublicKey('FgPPgkcrH4dQGnhkjVrYHJvtgWRKa3QQ1hzxVNM88Y2x');
  const slabLpOwner = new PublicKey('4uQeVj5tqW7CpQbaVjRGHCdKvD2DwnzdyiL7gbQjJj7');

  console.log('Finding portfolio PDAs with all bumps...\n');

  // Try all bumps for actual DLP
  console.log('Actual DLP keypair:', actualDlp.toBase58());
  for (let bump = 255; bump >= 0; bump--) {
    const seeds = [Buffer.from('portfolio'), actualDlp.toBuffer(), Buffer.from([bump])];
    let pda;
    try {
      pda = PublicKey.createProgramAddressSync(seeds, routerProgramId);
    } catch (e) {
      continue;
    }

    const accountInfo = await connection.getAccountInfo(pda);
    if (accountInfo) {
      console.log(`  Bump ${bump}: ${pda.toBase58()} - EXISTS (${accountInfo.lamports} lamports, ${accountInfo.data.length} bytes)`);
      break;
    }
  }

  console.log('\nSlab lp_owner:', slabLpOwner.toBase58());
  for (let bump = 255; bump >= 0; bump--) {
    const seeds = [Buffer.from('portfolio'), slabLpOwner.toBuffer(), Buffer.from([bump])];
    let pda;
    try {
      pda = PublicKey.createProgramAddressSync(seeds, routerProgramId);
    } catch (e) {
      continue;
    }

    const accountInfo = await connection.getAccountInfo(pda);
    if (accountInfo) {
      console.log(`  Bump ${bump}: ${pda.toBase58()} - EXISTS (${accountInfo.lamports} lamports, ${accountInfo.data.length} bytes)`);
      break;
    }
  }
}

findPortfolioPda().catch(console.error);
