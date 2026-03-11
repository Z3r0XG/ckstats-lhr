import bchaddr from 'bchaddrjs';
import ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc);

export function validateBitcoinAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (address.length === 0) return false;

  const coin = process.env.NEXT_PUBLIC_COIN || process.env.COIN || 'BTC';

  if (coin === 'BCH') {
    try {
      return bchaddr.isValidAddress(address);
    } catch {
      return false;
    }
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
