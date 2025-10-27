import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { RouterClient } from '@barista-dex/sdk';
import * as fs from 'fs';

const ROUTER_PROGRAM_ID = 'Hp6yAnuBFS7mU2P9c3euNrJv4h2oKvNmyWMUHKccB3wx';
const RPC_URL = 'http://localhost:8899';

async function main() {
  // Load payer keypair
  const payerKeypairPath = process.env.HOME + '/.config/solana/id.json';
  const payerKeypairData = JSON.parse(fs.readFileSync(payerKeypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(payerKeypairData));

  console.log('Payer:', payer.publicKey.toBase58());

  // Connect to Solana
  const connection = new Connection(RPC_URL, 'confirmed');

  // Create RouterClient
  const client = new RouterClient(
    connection,
    ROUTER_PROGRAM_ID,
    payer
  );

  // Build initialize registry instructions
  console.log('Building initialize registry instructions...');
  const instructions = await client.buildInitializeRegistryInstructions(payer.publicKey);

  // Create transaction
  const tx = new Transaction();
  for (const ix of instructions) {
    tx.add(ix);
  }

  // Send transaction
  console.log('Sending transaction...');
  const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: 'confirmed',
    skipPreflight: false,
  });

  console.log('✅ Registry initialized!');
  console.log('Signature:', signature);

  // Verify registry was created
  const [registryPDA] = client.deriveRegistryPDA();
  console.log('Registry PDA:', registryPDA.toBase58());

  const registryAccount = await connection.getAccountInfo(registryPDA);
  if (registryAccount) {
    console.log('✅ Registry account exists');
    console.log('Owner:', registryAccount.owner.toBase58());
    console.log('Size:', registryAccount.data.length, 'bytes');
  } else {
    console.log('❌ Registry account not found');
  }
}

main().catch(console.error);
