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

interface CoinExpectations {
  acceptLegacy: boolean;    // 1..., 3... (shared encoding between BTC and BCH)
  acceptBTCBech32: boolean; // bc1q, bc1p, tb1q, tb1p
  acceptBCHCashAddr: boolean; // bitcoincash:q..., q...
}

function runCommonTests({ acceptLegacy, acceptBTCBech32, acceptBCHCashAddr }: CoinExpectations) {
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
  test(`${acceptLegacy ? 'accepts' : 'rejects'} legacy address (1...)`, () => {
    expect(validateBitcoinAddress(BTC_LEGACY)).toBe(acceptLegacy);
  });

  test(`${acceptLegacy ? 'accepts' : 'rejects'} P2SH address (3...)`, () => {
    expect(validateBitcoinAddress(BTC_P2SH)).toBe(acceptLegacy);
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

  runCommonTests({ acceptLegacy: true, acceptBTCBech32: true, acceptBCHCashAddr: false });
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

  runCommonTests({ acceptLegacy: true, acceptBTCBech32: true, acceptBCHCashAddr: false });
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

  runCommonTests({ acceptLegacy: true, acceptBTCBech32: false, acceptBCHCashAddr: true });
});
