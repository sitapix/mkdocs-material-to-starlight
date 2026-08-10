import { describe, expect, it } from 'vitest';
import { normalizeFrontmatterFence } from './frontmatter-fence.js';

describe('normalizeFrontmatterFence', () => {
  it('rewrites a leading YAML document-end marker as a matching fence', () => {
    const source = '---\ntags:\n  - Networking\n...\n\n# Remote Access\n';
    expect(normalizeFrontmatterFence(source)).toBe(
      '---\ntags:\n  - Networking\n---\n\n# Remote Access\n',
    );
  });

  it('preserves a document-end marker in the body of valid frontmatter', () => {
    const source = '---\ntitle: Ellipsis\n---\n\n...\n';
    expect(normalizeFrontmatterFence(source)).toBe(source);
  });

  it('preserves documents without leading frontmatter', () => {
    const source = '# Ellipsis\n\n...\n';
    expect(normalizeFrontmatterFence(source)).toBe(source);
  });

  it('preserves CRLF and is idempotent', () => {
    const source = '---\r\ntitle: Remote Access\r\n...\r\n\r\nBody.\r\n';
    const once = normalizeFrontmatterFence(source);
    expect(once).toBe('---\r\ntitle: Remote Access\r\n---\r\n\r\nBody.\r\n');
    expect(normalizeFrontmatterFence(once)).toBe(once);
  });
});
