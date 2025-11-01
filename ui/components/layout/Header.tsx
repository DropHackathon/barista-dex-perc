'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/lib/wallet/WalletProvider';
import { useBarista } from '@/lib/hooks/useBarista';
import { usePortfolio } from '@/lib/hooks/usePortfolio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { truncateAddress, formatSol } from '@/lib/utils';
import { Wallet, LogOut, Plus, Copy, Check, AlertCircle } from 'lucide-react';
import BN from 'bn.js';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

export function Header() {
  const { connected, publicKey, connect, disconnect, connecting, mode, adapter } = useWallet();
  const { client } = useBarista();
  const { summary } = usePortfolio();
  const [showLocalnetModal, setShowLocalnetModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showBugsModal, setShowBugsModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('10');
  const [isDepositing, setIsDepositing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portfolioAddress, setPortfolioAddress] = useState<string | null>(null);

  // Derive portfolio address from wallet
  useEffect(() => {
    if (!client || !publicKey) {
      setPortfolioAddress(null);
      return;
    }

    client.getPortfolioAddress(publicKey).then(addr => {
      setPortfolioAddress(addr.toBase58());
    });
  }, [client, publicKey]);

  const handleConnect = () => {
    if (mode === 'localnet') {
      setShowLocalnetModal(true);
    } else {
      connect();
    }
  };

  const handleCopyPortfolio = async () => {
    if (!portfolioAddress) return;

    try {
      await navigator.clipboard.writeText(portfolioAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDeposit = async () => {
    if (!client || !publicKey || !adapter) return;

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsDepositing(true);
    try {
      // On localnet, airdrop SOL first
      if (mode === 'localnet') {
        console.log(`[Deposit] Airdropping ${amount} SOL to wallet...`);
        const connection = new Connection('http://localhost:8899', 'confirmed');
        const signature = await connection.requestAirdrop(
          publicKey,
          amount * LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(signature);
        console.log(`[Deposit] Airdrop successful: ${signature}`);
      }

      // Deposit to portfolio
      console.log(`[Deposit] Depositing ${amount} SOL to portfolio...`);
      const amountLamports = new BN(amount * 1e9);
      const depositSig = await client.deposit(amountLamports, publicKey, adapter);
      console.log(`[Deposit] Deposit successful: ${depositSig}`);

      setShowDepositModal(false);
      setDepositAmount('10');
    } catch (error) {
      console.error('[Deposit] Failed:', error);
      alert(`Deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/90 backdrop-blur-xl">
      <div className="flex h-10 items-center px-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tight text-white">Barista DEX</span>
          {mode === 'localnet' && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white border border-white/20">
              Localnet
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 items-center ml-6 space-x-0.5 text-[11px] font-medium">
          <a
            href="/"
            className="px-2 py-1 rounded transition-colors text-white"
          >
            Trade
          </a>
        </nav>

        {/* Known Bugs Button */}
        <button
          onClick={() => setShowBugsModal(true)}
          className="p-1.5 rounded text-yellow-400 hover:text-yellow-300 transition-colors"
          title="Known Bugs & Limitations"
        >
          <AlertCircle className="h-4 w-4" />
        </button>

        {/* Wallet Button */}
        <div className="flex items-center space-x-1.5">
          {!connected ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="gap-1.5 bg-secondary text-white/50 hover:text-white border border-border h-7 rounded text-[11px] px-2.5 transition-all inline-flex items-center justify-center disabled:opacity-50"
            >
              <Wallet className="h-3 w-3" />
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {/* Portfolio Balance with Deposit Button */}
              <div className="flex items-center gap-1 rounded border border-border bg-secondary/50 px-2 py-1 text-[11px]">
                <span className="text-white/50">Balance:</span>
                <span className="text-white font-medium font-mono">
                  {summary ? (Number(formatSol(summary.equity))).toFixed(3) : '0.000'} SOL
                </span>
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="ml-1 p-0.5 rounded text-white/50 hover:text-white transition-colors"
                  title="Deposit"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {/* Portfolio Address */}
              <button
                onClick={handleCopyPortfolio}
                className="flex items-center gap-1.5 rounded border border-border bg-secondary/50 px-2 py-1 text-[11px] font-mono hover:bg-secondary/70 transition-colors cursor-pointer"
                title="Click to copy portfolio address"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <span className="text-white/50">Portfolio:</span>
                <span className="text-white/70">{portfolioAddress && truncateAddress(portfolioAddress)}</span>
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-white/30" />
                )}
              </button>

              {/* Disconnect Button */}
              <Button
                onClick={disconnect}
                variant="ghost"
                className="h-7 w-7 p-0 text-white/50 hover:text-white rounded transition-colors"
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Localnet Setup Dialog */}
      <Dialog open={showLocalnetModal} onOpenChange={setShowLocalnetModal}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Localnet Wallet Setup</DialogTitle>
            <DialogDescription>
              Configure your private key in environment variables to connect on localnet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-white text-[10px] font-bold">
                  1
                </div>
                <p className="text-sm font-medium">Get your keypair</p>
              </div>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto ml-7">
                <code>cat ~/.config/solana/id.json</code>
              </pre>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-white text-[10px] font-bold">
                  2
                </div>
                <p className="text-sm font-medium">Add to .env.local</p>
              </div>
              <p className="text-xs text-muted-foreground ml-7">
                Open <code className="bg-muted px-1.5 py-0.5 rounded text-xs">ui/.env.local</code> and set:
              </p>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto ml-7">
                <code>NEXT_PUBLIC_LOCALNET_PRIVATE_KEY=[paste keypair array]</code>
              </pre>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-white text-[10px] font-bold">
                  3
                </div>
                <p className="text-sm font-medium">Restart dev server</p>
              </div>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto ml-7">
                <code>cd ui && pnpm run dev</code>
              </pre>
            </div>

            {/* Note */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 ml-7">
              <p className="text-xs text-white">
                ⚠️ Wallet will auto-connect on page load when configured.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={showDepositModal} onOpenChange={setShowDepositModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deposit to Portfolio</DialogTitle>
            <DialogDescription>
              {mode === 'localnet'
                ? 'On localnet, SOL will be airdropped to your connected wallet then deposited to your portfolio account.'
                : 'Deposit SOL from your wallet to your trading portfolio.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (SOL)</Label>
              <Input
                id="deposit-amount"
                type="number"
                step="0.1"
                min="0.1"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="10.0"
                disabled={isDepositing}
              />
              <p className="text-xs text-muted-foreground">
                {mode === 'localnet' ? 'Recommended: 10-100 SOL for testing.' : 'Minimum: 0.1 SOL'}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowDepositModal(false)}
              disabled={isDepositing}
              className="text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeposit}
              disabled={isDepositing}
              className="bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20"
            >
              {isDepositing ? 'Depositing...' : `Deposit ${depositAmount} SOL`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Known Bugs & Limitations Dialog */}
      <Dialog open={showBugsModal} onOpenChange={setShowBugsModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Known Bugs & Limitations</DialogTitle>
            <DialogDescription>
              Current issues and limitations in Barista DEX
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Critical Bugs */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-red-400">Critical Issues</h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-red-400">•</span>
                  <span>None currently identified</span>
                </li>
              </ul>
            </div>

            {/* Known Limitations */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-yellow-400">Limitations</h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-yellow-400">•</span>
                  <span><strong>No Liquidations:</strong> Liquidation mechanism is not currently implemented</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-400">•</span>
                  <span><strong>Single Instrument:</strong> Only one trading pair supported per slab</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-400">•</span>
                  <span><strong>No True Limit Orders:</strong> Limit orders are currently atomic (instant) fills at whatever price user specifies</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-400">•</span>
                  <span><strong>Leverage Range:</strong> Supports 1x-10x leverage only</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-400">•</span>
                  <span><strong>Localnet Only:</strong> Currently configured for local development only</span>
                </li>
              </ul>
            </div>

            {/* Minor Issues */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-blue-400">Minor Issues</h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-blue-400">•</span>
                  <span><strong>Mean Leverage Display:</strong> Spot trades (1x) do not properly aggregate mean leverage when leveraged trades are added to the position</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400">•</span>
                  <span><strong>UI Polling:</strong> Portfolio data refreshes every 5 seconds (may show brief stale data)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-400">•</span>
                  <span><strong>Price Updates:</strong> Mark prices update on-chain only, not real-time from oracle</span>
                </li>
              </ul>
            </div>

            {/* Recent Fixes */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-emerald-400">Recently Fixed</h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>1x Leverage:</strong> Fixed insufficient margin error for 1x leverage trades</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>Position Reversal:</strong> Fixed margin calculation when flipping long/short</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>PnL Calculation:</strong> Corrected leverage multiplier in unrealized PnL</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setShowBugsModal(false)}
              className="bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
