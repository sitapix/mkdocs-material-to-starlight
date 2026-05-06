import { describe, expect, it } from 'vitest';
import { assertPathWithin } from './path-within.js';

describe('assertPathWithin', () => {
  it('accepts a path strictly inside the base directory', () => {
    const result = assertPathWithin('/project/docs', '/project/docs/snippets/a.md');
    expect(result.ok).toBe(true);
  });

  it('accepts a path nested inside subdirectories of the base', () => {
    const result = assertPathWithin('/project/docs', '/project/docs/a/b/c/d.md');
    expect(result.ok).toBe(true);
  });

  it('accepts the base directory itself', () => {
    const result = assertPathWithin('/project/docs', '/project/docs');
    expect(result.ok).toBe(true);
  });

  it('rejects a path that escapes via parent traversal', () => {
    const result = assertPathWithin('/project/docs', '/project/secret/key');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path-escapes-base');
      expect(result.error.candidate).toBe('/project/secret/key');
      expect(result.error.baseDir).toBe('/project/docs');
    }
  });

  it('rejects a sibling that shares the base prefix as a substring', () => {
    // /project/docs-secret starts with /project/docs but is not within it.
    const result = assertPathWithin('/project/docs', '/project/docs-secret/file');
    expect(result.ok).toBe(false);
  });

  it('rejects an absolute system path far outside', () => {
    const result = assertPathWithin('/project/docs', '/etc/passwd');
    expect(result.ok).toBe(false);
  });

  it('rejects a path that traverses up via ..', () => {
    // The candidate is the *normalised* absolute path; this test exercises
    // what the caller is expected to pass after path.resolve().
    const result = assertPathWithin('/project/docs', '/project');
    expect(result.ok).toBe(false);
  });

  it('handles trailing slashes on the base directory consistently', () => {
    expect(assertPathWithin('/project/docs/', '/project/docs/a.md').ok).toBe(true);
    expect(assertPathWithin('/project/docs/', '/project/secret/file').ok).toBe(false);
  });
});
