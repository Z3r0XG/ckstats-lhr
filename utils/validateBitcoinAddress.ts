import ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc);



export function validateBitcoinAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (address.length === 0) return false;

  try {
    bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
    return true;
  } catch {
    void 0;
  }

  try {
    bitcoin.address.toOutputScript(address, bitcoin.networks.testnet);
    return true;
  } catch {
    void 0;
  }

  return false;
}
