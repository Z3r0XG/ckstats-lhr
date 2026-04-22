import bchaddr from 'bchaddrjs';
import ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc);

const DGB_NETWORK: bitcoin.Network = {
  messagePrefix: '\x18DigiByte Signed Message:\n',
  bech32: 'dgb',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x1e,
  scriptHash: 0x3f,
  wif: 0x80,
};

export function validateBitcoinAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (address.length === 0) return false;

  const coin = process.env.NEXT_PUBLIC_COIN || process.env.COIN || 'BTC';

  if (coin === 'DGB') {
    try {
      bitcoin.address.toOutputScript(address, DGB_NETWORK);
      return true;
    } catch {
      return false;
    }
  }

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
