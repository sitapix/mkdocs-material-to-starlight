import { describe, expect, it } from 'vitest';
import { normalizeMaterialShortcodes } from './material-shortcodes.js';

describe('normalizeMaterialShortcodes', () => {
  it('returns source unchanged when no md:* shortcodes', () => {
    expect(normalizeMaterialShortcodes('# Title\n\nText.\n')).toBe('# Title\n\nText.\n');
  });

  it('replaces md:version with literal "Available since"', () => {
    const out = normalizeMaterialShortcodes('<!-- md:version 8.3.0 -->\n\nBody.\n');
    expect(out).toContain('Available since: 8.3.0');
    expect(out).not.toContain('md:version');
  });

  it('replaces md:flag experimental', () => {
    expect(normalizeMaterialShortcodes('<!-- md:flag experimental -->')).toContain(
      'Experimental flag',
    );
  });

  it('replaces md:option, md:setting, md:plugin', () => {
    const out = normalizeMaterialShortcodes(
      [
        '<!-- md:option foo -->',
        '<!-- md:setting plugins.bar -->',
        '<!-- md:plugin search -->',
      ].join('\n'),
    );
    expect(out).toContain('Option: `foo`');
    expect(out).toContain('Setting: `plugins.bar`');
    expect(out).toContain('Plugin: `search`');
  });

  it('replaces unknown shortcodes with capitalized kind + args', () => {
    expect(normalizeMaterialShortcodes('<!-- md:custom whatever -->')).toContain(
      'Custom: whatever',
    );
  });

  it('idempotent', () => {
    const src = '<!-- md:version 8.3.0 -->';
    const first = normalizeMaterialShortcodes(src);
    expect(normalizeMaterialShortcodes(first)).toBe(first);
  });
});
