import { formatTimeAgo } from '../../utils/helpers';

describe('Timestamp Handling', () => {
  describe('Epoch to Date Conversion', () => {
    it('should convert ckpool epoch to UTC Date correctly', () => {
      const epoch = 1764403689; // 2025-11-29T08:08:09Z
      const date = new Date(epoch * 1000);
      expect(date.toISOString()).toBe('2025-11-29T08:08:09.000Z');
    });

    it('should handle different epochs', () => {
      const epoch = 1609459200; // 2021-01-01T00:00:00Z
      const date = new Date(epoch * 1000);
      expect(date.toISOString()).toBe('2021-01-01T00:00:00.000Z');
    });
  });

  describe('formatTimeAgo', () => {
    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-11-29T08:10:00Z')); // Fixed "now"
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should format very recent times as "Recently"', () => {
      const recentDate = new Date('2025-11-29T08:09:30Z'); // 30 sec ago
      expect(formatTimeAgo(recentDate)).toBe('Recently');
    });

    it('should format minutes ago', () => {
      const date5MinAgo = new Date('2025-11-29T08:05:00Z');
      expect(formatTimeAgo(date5MinAgo)).toBe('5 mins ago');
    });

    it('should format hours and minutes ago', () => {
      const date1HourAgo = new Date('2025-11-29T07:05:00Z');
      expect(formatTimeAgo(date1HourAgo)).toBe('1 hour 5 mins ago');
    });
  });
});