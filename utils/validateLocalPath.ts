import * as fs from 'fs';
import * as path from 'path';

/**
 * Validates and resolves a local file path to prevent path traversal attacks.
 * Used when API_URL points to a local filesystem directory.
 *
 * @param address - Bitcoin address (must be alphanumeric only)
 * @param basePath - Base directory path (API_URL)
 * @returns Resolved absolute path within the base directory
 * @throws Error if address contains invalid characters or path escapes base
 */
export function validateAndResolveUserPath(
  address: string,
  basePath: string
): string {
  // Validate address is not empty and contains only alphanumeric characters
  if (!address || /[^a-zA-Z0-9]/.test(address)) {
    throw new Error('Address contains invalid characters');
  }

  // Resolve paths and check for traversal attempts
  const root = fs.realpathSync(path.resolve(basePath));
  const target = path.resolve(root, `users/${address}`);
  const resolved = fs.realpathSync(target);

  if (!resolved.startsWith(root + path.sep)) {
    throw new Error('Invalid path for user data');
  }

  return resolved;
}
