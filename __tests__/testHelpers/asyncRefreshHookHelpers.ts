/**
 * Shared test utilities for async refresh hooks.
 * Ensures all hooks follow consistent patterns for payload structure and behavior.
 */

import { REFRESH_INTERVAL_MS } from '../../lib/hooks/useDashboardData';

/**
 * Validates that a payload has the required generatedAt field with valid ISO date.
 */
export function testGeneratedAtField(payload: { generatedAt: string }) {
  expect(payload).toHaveProperty('generatedAt');
  expect(typeof payload.generatedAt).toBe('string');
  
  const date = new Date(payload.generatedAt);
  expect(date.toString()).not.toBe('Invalid Date');
  expect(payload.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
}

/**
 * Tests stale detection logic: data older than 2× refresh interval should be stale.
 */
export function testStaleDetection(payloadFactory: (ageMs: number) => { generatedAt: string }) {
  // Stale data: older than 2× interval
  const staleTime = Date.now() - (REFRESH_INTERVAL_MS * 2.5);
  const stalePayload = payloadFactory(staleTime);
  
  const staleAgeMs = Date.now() - new Date(stalePayload.generatedAt).getTime();
  const isStale = staleAgeMs > REFRESH_INTERVAL_MS * 2;
  
  expect(isStale).toBe(true);
  
  // Fresh data: within interval
  const freshTime = Date.now() - Math.floor(REFRESH_INTERVAL_MS / 6);
  const freshPayload = payloadFactory(freshTime);
  
  const freshAgeMs = Date.now() - new Date(freshPayload.generatedAt).getTime();
  const isFresh = freshAgeMs <= REFRESH_INTERVAL_MS * 2;
  
  expect(isFresh).toBe(true);
}

/**
 * Validates that bigint fields are properly serialized to strings.
 */
export function expectBigIntSerialized(value: unknown) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^\d+$/);
}

/**
 * Validates that date fields are properly serialized to ISO strings.
 */
export function expectDateSerialized(value: unknown) {
  expect(typeof value).toBe('string');
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  const date = new Date(value as string);
  expect(date.toString()).not.toBe('Invalid Date');
}

/**
 * Tests that a payload serializes within reasonable size constraints.
 */
export function testPayloadSize(payload: unknown, maxKb: number) {
  const jsonString = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
  const sizeKb = sizeBytes / 1024;
  
  expect(sizeBytes).toBeLessThan(maxKb * 1024);
  
  return { sizeBytes, sizeKb };
}
