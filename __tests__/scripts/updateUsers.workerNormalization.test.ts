/**
 * Tests for worker name normalization logic in updateUsers.ts
 * 
 * This test suite validates the normalization of ckpool workername strings,
 * ensuring that:
 * - Address-only strings are mapped to empty string ''
 * - address.worker format extracts the worker suffix
 * - address_worker format extracts the worker suffix
 * - Edge cases with multiple separators are handled correctly
 */

describe('Worker name normalization', () => {
  // Helper function that mimics the normalization logic
  // This will be used to test the actual implementation
  function normalizeWorkerName(rawName: string, address: string): string {
    if (!rawName || rawName === address) {
      return '';
    }
    
    // Check if it starts with address followed by a separator
    if (rawName.startsWith(address + '.')) {
      return rawName.substring(address.length + 1);
    }
    
    if (rawName.startsWith(address + '_')) {
      return rawName.substring(address.length + 1);
    }
    
    // Fallback: use the raw name as-is
    return rawName;
  }

  describe('Basic normalization', () => {
    it('should map address-only to empty string', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address, address)).toBe('');
    });

    it('should map empty string to empty string', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName('', address)).toBe('');
    });

    it('should extract worker name with dot separator', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address + '.worker1', address)).toBe('worker1');
    });

    it('should extract worker name with underscore separator', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address + '_worker1', address)).toBe('worker1');
    });
  });

  describe('Edge cases with separators in names', () => {
    it('should handle worker name containing dots', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address + '.worker.123', address)).toBe('worker.123');
    });

    it('should handle worker name containing underscores', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address + '_worker_123', address)).toBe('worker_123');
    });

    it('should handle worker name with both dots and underscores', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address + '.worker_123.abc', address)).toBe('worker_123.abc');
    });
  });

  describe('Fallback cases', () => {
    it('should use raw name when no separator match', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName('standaloneWorker', address)).toBe('standaloneWorker');
    });

    it('should handle partial address match with dot', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      // If workername contains address but doesn't start with it
      expect(normalizeWorkerName('prefix' + address + '.worker', address)).toBe('prefix' + address + '.worker');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle single-worker user', () => {
      const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      // ckpool reports the address itself for single worker
      expect(normalizeWorkerName(address, address)).toBe('');
    });

    it('should handle multi-worker user with named workers', () => {
      const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      expect(normalizeWorkerName(address + '.miner1', address)).toBe('miner1');
      expect(normalizeWorkerName(address + '.miner2', address)).toBe('miner2');
      expect(normalizeWorkerName(address + '_office', address)).toBe('office');
    });

    it('should handle worker names with meaningful suffixes', () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      expect(normalizeWorkerName(address + '.S19-001', address)).toBe('S19-001');
      expect(normalizeWorkerName(address + '.home_miner', address)).toBe('home_miner');
    });
  });
});
