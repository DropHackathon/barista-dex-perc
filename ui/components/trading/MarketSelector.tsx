import { PublicKey } from '@solana/web3.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMarkets } from '@/lib/hooks/useMarkets';
import { useEffect } from 'react';

interface MarketSelectorProps {
  value: PublicKey | null;
  onChange: (slab: PublicKey) => void;
}

export function MarketSelector({ value, onChange }: MarketSelectorProps) {
  const { markets, isLoading } = useMarkets();

  // Auto-select first market when markets load
  useEffect(() => {
    if (!value && markets.length > 0) {
      onChange(markets[0].slab);
    }
  }, [markets, value, onChange]);

  if (isLoading) {
    return (
      <div className="text-sm text-white/50">Loading markets...</div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="text-sm text-white/50">No markets available</div>
    );
  }

  return (
    <Select
      value={value?.toBase58()}
      onValueChange={(val) => onChange(new PublicKey(val))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select market" />
      </SelectTrigger>
      <SelectContent>
        {markets.map((market) => (
          <SelectItem key={market.slab.toBase58()} value={market.slab.toBase58()}>
            <span className="font-medium">{market.symbol}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
