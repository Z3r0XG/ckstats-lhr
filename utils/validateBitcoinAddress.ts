import bchaddr from 'bchaddrjs';
import ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc);

export function validateBitcoinAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (address.length === 0) return false;

  const coin = process.env.NEXT_PUBLIC_COIN || process.env.COIN || 'BTC';

  if (coin === 'BCH') {
    // Accept CashAddr (with or without prefix)
    try {
      if (bchaddr.isValidAddress(address)) return true;
    } catch {
      void 0;
    }
    // Also accept legacy P2PKH/P2SH format (same encoding as BTC mainnet)
    // Only attempt for 1.../3... prefixes — bech32 (bc1...) must be rejected
    if (/^[13]/.test(address)) {
      try {
        bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
        return true;
      } catch {
        void 0;
      }
    }
    return false;
  }

  for (const network of [bitcoin.networks.bitcoin, bitcoin.networks.testnet]) {
    try {
      bitcoin.address.toOutputScript(address, network);
      return true;
    } catch {
      void 0;
    }
  }

  return false;
}
