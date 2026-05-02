import { validateBitcoinAddress } from '../../utils/validateBitcoinAddress';

// Addresses used across all coin modes
const BTC_LEGACY = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
const BTC_P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
const BTC_BECH32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const BTC_BECH32M = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';
const BTC_TESTNET_BECH32 = 'tb1qn9quw86c6gv3642enrxaglvrqxt032kej9ydjh';
const BTC_TESTNET_BECH32M = 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqp3mvzv';
const BCH_CASHADDR = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';
const BCH_CASHADDR_NO_PREFIX = 'qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';
const DGB_LEGACY = 'DGEX9JsfNuCCA3ovxAmUSM1GCea1BpY4Et';
const DGB_P2SH = 'SQwL7TJrVbwyerVAGdUPMwHBhacNjrRzo9';
const DGB_BECH32 = 'dgb1q6tf0myda7plmpksdqc8k4tf8q957z0fm0y9a5m';
const DGB_BECH32M = 'dgb1p33wm0auhr9kkahzd6l0kqj85af4cswn276hsxg6zpz85xe2r0y8sev3mt5';
const CHTA_P2PKH = 'CVXL3EHkrH8xWsv4ECtwWxJqzHQG9KujNq';

interface CoinExpectations {
  acceptBTCP2PKH: boolean;  // 1... (BTC/BCH legacy P2PKH)
  acceptBTCP2SH: boolean;   // 3... (BTC/BCH/CHTA P2SH)
  acceptBTCBech32: boolean; // bc1q, bc1p, tb1q, tb1p
  acceptBCHCashAddr: boolean; // bitcoincash:q..., q...
  acceptDGBLegacy: boolean; // D..., S...
  acceptDGBBech32: boolean; // dgb1q..., dgb1p...
  acceptCHTAP2PKH: boolean; // C...
}

function runCommonTests({ acceptBTCP2PKH, acceptBTCP2SH, acceptBTCBech32, acceptBCHCashAddr, acceptDGBLegacy, acceptDGBBech32, acceptCHTAP2PKH }: CoinExpectations) {
  // Input validation — always rejects regardless of coin
  test('rejects null', () => {
    expect(validateBitcoinAddress(null as any)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(validateBitcoinAddress(undefined as any)).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateBitcoinAddress('')).toBe(false);
  });

  test('rejects invalid address', () => {
    expect(validateBitcoinAddress('invalid_address')).toBe(false);
  });

  test('rejects address with spaces', () => {
    expect(validateBitcoinAddress(` ${BTC_LEGACY} `)).toBe(false);
  });

  test('rejects address with Unicode characters', () => {
    expect(validateBitcoinAddress(`${BTC_LEGACY}🚀`)).toBe(false);
  });

  test('rejects valid Ethereum address', () => {
    expect(validateBitcoinAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e')).toBe(false);
  });

  test('rejects address with invalid characters', () => {
    expect(validateBitcoinAddress(`${BTC_LEGACY}!`)).toBe(false);
  });

  test('rejects address with incorrect length', () => {
    expect(validateBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN')).toBe(false);
  });

  test('rejects address with incorrect prefix', () => {
    expect(validateBitcoinAddress('4BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(false);
  });

  test('rejects valid format with corrupted checksum', () => {
    expect(validateBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3')).toBe(false);
  });

  // Legacy address tests (shared between BTC and BCH)
  test(`${acceptBTCP2PKH ? 'accepts' : 'rejects'} legacy address (1...)`, () => {
    expect(validateBitcoinAddress(BTC_LEGACY)).toBe(acceptBTCP2PKH);
  });

  test(`${acceptBTCP2SH ? 'accepts' : 'rejects'} P2SH address (3...)`, () => {
    expect(validateBitcoinAddress(BTC_P2SH)).toBe(acceptBTCP2SH);
  });

  // BTC bech32 address tests
  test(`${acceptBTCBech32 ? 'accepts' : 'rejects'} BTC bech32 address (bc1q)`, () => {
    expect(validateBitcoinAddress(BTC_BECH32)).toBe(acceptBTCBech32);
  });

  test(`${acceptBTCBech32 ? 'accepts' : 'rejects'} BTC bech32m address (bc1p)`, () => {
    expect(validateBitcoinAddress(BTC_BECH32M)).toBe(acceptBTCBech32);
  });

  test(`${acceptBTCBech32 ? 'accepts' : 'rejects'} BTC testnet bech32 address (tb1q)`, () => {
    expect(validateBitcoinAddress(BTC_TESTNET_BECH32)).toBe(acceptBTCBech32);
  });

  test(`${acceptBTCBech32 ? 'accepts' : 'rejects'} BTC testnet bech32m address (tb1p)`, () => {
    expect(validateBitcoinAddress(BTC_TESTNET_BECH32M)).toBe(acceptBTCBech32);
  });

  test('rejects bech32 with incorrect hrp', () => {
    expect(validateBitcoinAddress('bb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
  });

  test('rejects bech32 with mixed case', () => {
    expect(validateBitcoinAddress('BC1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
  });

  test('rejects malformed bech32 - missing separator', () => {
    expect(validateBitcoinAddress('bcqar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe(false);
  });

  test('rejects malformed bech32 - wrong padding', () => {
    expect(validateBitcoinAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5md')).toBe(false);
  });

  test('rejects taproot address with invalid length', () => {
    expect(validateBitcoinAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq')).toBe(false);
  });

  test('rejects taproot data with wrong witness version (bc1q)', () => {
    expect(validateBitcoinAddress('bc1q0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')).toBe(false);
  });

  test('rejects taproot address with mixed case', () => {
    expect(validateBitcoinAddress('BC1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')).toBe(false);
  });

  // BCH CashAddr tests
  test(`${acceptBCHCashAddr ? 'accepts' : 'rejects'} BCH CashAddr (bitcoincash:q...)`, () => {
    expect(validateBitcoinAddress(BCH_CASHADDR)).toBe(acceptBCHCashAddr);
  });

  test(`${acceptBCHCashAddr ? 'accepts' : 'rejects'} BCH CashAddr without prefix`, () => {
    expect(validateBitcoinAddress(BCH_CASHADDR_NO_PREFIX)).toBe(acceptBCHCashAddr);
  });

  // DGB address tests
  test(`${acceptDGBLegacy ? 'accepts' : 'rejects'} DGB legacy address (D...)`, () => {
    expect(validateBitcoinAddress(DGB_LEGACY)).toBe(acceptDGBLegacy);
  });

  test(`${acceptDGBLegacy ? 'accepts' : 'rejects'} DGB P2SH address (S...)`, () => {
    expect(validateBitcoinAddress(DGB_P2SH)).toBe(acceptDGBLegacy);
  });

  test(`${acceptDGBBech32 ? 'accepts' : 'rejects'} DGB bech32 address (dgb1q...)`, () => {
    expect(validateBitcoinAddress(DGB_BECH32)).toBe(acceptDGBBech32);
  });

  test(`${acceptDGBBech32 ? 'accepts' : 'rejects'} DGB bech32m address (dgb1p...)`, () => {
    expect(validateBitcoinAddress(DGB_BECH32M)).toBe(acceptDGBBech32);
  });

  // CHTA address tests
  test(`${acceptCHTAP2PKH ? 'accepts' : 'rejects'} CHTA P2PKH address (C...)`, () => {
    expect(validateBitcoinAddress(CHTA_P2PKH)).toBe(acceptCHTAP2PKH);
  });
}

describe('validateBitcoinAddress — COIN unset (defaults to BTC)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    delete process.env.COIN;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    delete process.env.COIN;
  });

  runCommonTests({ acceptBTCP2PKH: true, acceptBTCP2SH: true, acceptBTCBech32: true, acceptBCHCashAddr: false, acceptDGBLegacy: false, acceptDGBBech32: false, acceptCHTAP2PKH: false });
});

describe('validateBitcoinAddress — COIN=BTC', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    process.env.COIN = 'BTC';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    delete process.env.COIN;
  });

  runCommonTests({ acceptBTCP2PKH: true, acceptBTCP2SH: true, acceptBTCBech32: true, acceptBCHCashAddr: false, acceptDGBLegacy: false, acceptDGBBech32: false, acceptCHTAP2PKH: false });
});

describe('validateBitcoinAddress — COIN=BCH', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    process.env.COIN = 'BCH';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    delete process.env.COIN;
  });

  runCommonTests({ acceptBTCP2PKH: true, acceptBTCP2SH: true, acceptBTCBech32: false, acceptBCHCashAddr: true, acceptDGBLegacy: false, acceptDGBBech32: false, acceptCHTAP2PKH: false });
});

describe('validateBitcoinAddress — COIN=DGB', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    process.env.COIN = 'DGB';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    delete process.env.COIN;
  });

  runCommonTests({ acceptBTCP2PKH: false, acceptBTCP2SH: false, acceptBTCBech32: false, acceptBCHCashAddr: false, acceptDGBLegacy: true, acceptDGBBech32: true, acceptCHTAP2PKH: false });
});

describe('validateBitcoinAddress — COIN=CHTA', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    process.env.COIN = 'CHTA';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_COIN;
    delete process.env.COIN;
  });

  runCommonTests({ acceptBTCP2PKH: false, acceptBTCP2SH: true, acceptBTCBech32: false, acceptBCHCashAddr: false, acceptDGBLegacy: false, acceptDGBBech32: false, acceptCHTAP2PKH: true });
});
