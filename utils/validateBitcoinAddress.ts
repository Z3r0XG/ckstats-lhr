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

const CHTA_NETWORK: bitcoin.Network = {
  messagePrefix: '\x18Cheetahcoin Signed Message:\n',
  bech32: '', // CHTA has no segwit/bech32; empty HRP ensures toOutputScript rejects any bech32 input
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x1c,
  scriptHash: 0x05,
  wif: 0x80,
};

export function validateBitcoinAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (address.length === 0) return false;

  const coin = (process.env.NEXT_PUBLIC_COIN || process.env.COIN || 'BTC').trim().toUpperCase();

  if (coin === 'DGB') {
    try {
      bitcoin.address.toOutputScript(address, DGB_NETWORK);
      return true;
    } catch {
      return false;
    }
  }

  if (coin === 'CHTA') {
    // CHTA has no segwit/bech32; only P2PKH (C...) and P2SH (3...) are valid
    if (!/^[C3]/.test(address)) return false;
    try {
      bitcoin.address.toOutputScript(address, CHTA_NETWORK);
      return true;
    } catch {
      return false;
    }
  }

  if (coin === 'BCH') {
    // Accept CashAddr (with or without prefix) and legacy Base58Check addresses;
    // bech32 (bc1...) is implicitly rejected — not a valid CashAddr or legacy address
    try {
      if (bchaddr.isCashAddress(address) || bchaddr.isLegacyAddress(address)) return true;
    } catch {
      void 0;
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
