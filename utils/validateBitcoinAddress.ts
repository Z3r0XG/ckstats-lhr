import ecc from '@bitcoinerlab/secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

// Init ECC in case a taproot address is specified
bitcoin.initEccLib(ecc);

/**
 * Tests if the address is a valid Bitcoin address.
 * @param {string} address - The Bitcoin address to validate.
 * @returns {boolean} True if a valid Bitcoin address.
 */

export function validateBitcoinAddress(address: string): boolean {
  // Quick sanity checks
  if (typeof address !== 'string') return false;
  if (address.length === 0) return false;

  // Try mainnet first (covers 1/3, bc1q, bc1p)
  try {
    bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
    return true;
  } catch {
    // intentionally ignore parse error; return false if no match
    void 0;
  }

  // Then testnet (covers m/n/2, tb1q, tb1p; works for testnet4 bech32 hrp `tb`)
  try {
    bitcoin.address.toOutputScript(address, bitcoin.networks.testnet);
    return true;
  } catch {
    // intentionally ignore parse error; return false if no match
    void 0;
  }

  return false;
}
