/**
 * @jest-environment node
 */

import { formatUserDataSummary, MessageCollectors } from '../../scripts/updateUsers';

describe('updateUsers summary formatter', () => {
  it('formats a correct summary using numeric counters', () => {
    const messages: MessageCollectors = {
      success: ['Updated user and 1 workers for: a', 'Updated user and 2 workers for: b'],
      deactivations: ['Marked user x as inactive'],
      gracePeriod: ['User y within grace period'],
      errors: ['Failed to update user z'],
      successCount: 2,
      workersCount: 3,
      deactivationsCount: 1,
      gracePeriodCount: 1,
      errorsCount: 1,
    };

    const summary = formatUserDataSummary(messages, /* totalUsers */ 2, /* batchSize */ 100);
    expect(summary).toBe('Processed 1 batch, 2 users, 3 workers');
  });

  it('falls back to array lengths when counters are missing', () => {
    const messages: MessageCollectors = {
      success: ['Updated user and 1 workers for: a'],
      deactivations: [],
      gracePeriod: [],
      errors: [],
      // counters omitted intentionally
    };

    const summary = formatUserDataSummary(messages, 1, 100);
    expect(summary).toBe('Processed 1 batch, 1 users, 0 workers');
  });
});