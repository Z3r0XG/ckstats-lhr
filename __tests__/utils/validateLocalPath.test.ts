import * as fs from 'fs';
import * as path from 'path';
import { validateAndResolveUserPath } from '../../utils/validateLocalPath';

describe('validateAndResolveUserPath', () => {
  const testDir = path.join(__dirname, '../../.test-validate-path');
  const usersDir = path.join(testDir, 'users');

  beforeAll(() => {
    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(usersDir)) {
      fs.mkdirSync(usersDir, { recursive: true });
    }
    // Create a valid user directory
    const validUserDir = path.join(usersDir, 'bc1qvalid123');
    if (!fs.existsSync(validUserDir)) {
      fs.mkdirSync(validUserDir);
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('valid addresses', () => {
    it('should resolve valid alphanumeric address', () => {
      const resolved = validateAndResolveUserPath('bc1qvalid123', testDir);
      expect(resolved).toContain('users');
      expect(resolved).toContain('bc1qvalid123');
      expect(resolved.startsWith(fs.realpathSync(testDir))).toBe(true);
    });

    it('should handle uppercase letters', () => {
      const upperDir = path.join(usersDir, 'TESTADDRESS');
      fs.mkdirSync(upperDir, { recursive: true });
      const resolved = validateAndResolveUserPath('TESTADDRESS', testDir);
      expect(resolved).toContain('TESTADDRESS');
      fs.rmSync(upperDir, { recursive: true, force: true });
    });

    it('should handle numeric-only address', () => {
      const numDir = path.join(usersDir, '123456789');
      fs.mkdirSync(numDir, { recursive: true });
      const resolved = validateAndResolveUserPath('123456789', testDir);
      expect(resolved).toContain('123456789');
      fs.rmSync(numDir, { recursive: true, force: true });
    });
  });

  describe('invalid characters', () => {
    it('should reject address with forward slash', () => {
      expect(() => {
        validateAndResolveUserPath('test/path', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject address with backslash', () => {
      expect(() => {
        validateAndResolveUserPath('test\\path', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject address with dot', () => {
      expect(() => {
        validateAndResolveUserPath('test.address', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject address with hyphen', () => {
      expect(() => {
        validateAndResolveUserPath('test-address', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject address with underscore', () => {
      expect(() => {
        validateAndResolveUserPath('test_address', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject address with special characters', () => {
      expect(() => {
        validateAndResolveUserPath('test@address', testDir);
      }).toThrow('Address contains invalid characters');
    });
  });

  describe('path traversal attempts', () => {
    it('should reject address with parent directory reference', () => {
      expect(() => {
        validateAndResolveUserPath('../etc/passwd', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject address with absolute path', () => {
      expect(() => {
        validateAndResolveUserPath('/etc/passwd', testDir);
      }).toThrow('Address contains invalid characters');
    });

    it('should reject empty address', () => {
      expect(() => {
        validateAndResolveUserPath('', testDir);
      }).toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw if user directory does not exist', () => {
      expect(() => {
        validateAndResolveUserPath('nonexistent123', testDir);
      }).toThrow();
    });

    it('should throw if base path does not exist', () => {
      expect(() => {
        validateAndResolveUserPath('bc1qvalid123', '/nonexistent/base/path');
      }).toThrow();
    });
  });
});
