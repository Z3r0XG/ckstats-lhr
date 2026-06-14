/**
 * @jest-environment node
 *
 * Unit tests for isEmptyPoolStatus — the guard that makes seed() skip a cycle
 * when ckpool's pool.status read yielded no usable data (0-byte / blank-line
 * read during the truncate-then-write window). Locks in the "any defined value"
 * check so a future refactor can't silently reintroduce all-zeros rows.
 */

import { isEmptyPoolStatus } from '../../scripts/seed';

describe('isEmptyPoolStatus', () => {
  it('treats a fully empty parse result as empty', () => {
    expect(isEmptyPoolStatus({})).toBe(true);
  });

  it('treats an all-undefined object as empty (e.g. only diffRaw set to undefined)', () => {
    // fetchPoolStats always assigns diffRaw, possibly undefined, so a 0-byte
    // read yields { diffRaw: undefined } rather than {}.
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
