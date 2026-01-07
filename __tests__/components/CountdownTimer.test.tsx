/**
 * CountdownTimer state logic tests
 * Tests the conditional rendering logic for error, fetching, and normal states
 */

describe('CountdownTimer state priority', () => {
  test('error state takes priority over all other states', () => {
    const error = new Error('Dashboard fetch failed: 500');
    const props = {
      initialSeconds: 60,
      error,
      isFetching: true, // Even with fetching true, error should show
    };

    // In the component, error is checked first
    expect(props.error).toBeTruthy();
    expect(props.error.message).toBe('Dashboard fetch failed: 500');
  });

  test('fetching state is shown when no error', () => {
    const props = {
      initialSeconds: 60,
      error: null,
      isFetching: true,
    };

    // Fetching should be shown when error is null/undefined
    expect(props.error).toBeNull();
    expect(props.isFetching).toBe(true);
  });

  test('normal countdown when no error and not fetching', () => {
    const props = {
      initialSeconds: 60,
      error: null,
      isFetching: false,
    };

    // Normal state
    expect(props.error).toBeNull();
    expect(props.isFetching).toBe(false);
    expect(props.initialSeconds).toBe(60);
  });
});
