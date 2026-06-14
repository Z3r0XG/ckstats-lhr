/**
 * @jest-environment node
 *
 * Unit tests for isEmptyPoolStatus — the predicate that makes seed() skip a
 * cycle when a pool.status read yields no usable data (a 0-byte / blank-line
 * read parses to a status whose every value is undefined).
 */

import { isEmptyPoolStatus } from '../../scripts/seed';

describe('isEmptyPoolStatus', () => {
  it('treats a fully empty parse result as empty', () => {
    expect(isEmptyPoolStatus({})).toBe(true);
  });

  it('treats an all-undefined object as empty (e.g. only diffRaw set to undefined)', () => {
    // A parsed status always carries a diffRaw key (possibly undefined), so an
    // empty read is { diffRaw: undefined }, not {}.
    expect(isEmptyPoolStatus({ diffRaw: undefined })).toBe(true);
  });

  it('treats a status with at least one defined value as non-empty', () => {
    expect(isEmptyPoolStatus({ runtime: '1827253', diffRaw: undefined })).toBe(
      false
    );
  });

  it('treats a zero-valued status as non-empty (real zeros are data)', () => {
    expect(isEmptyPoolStatus({ Users: '0' })).toBe(false);
  });
});
