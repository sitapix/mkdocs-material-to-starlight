import { describe, expect, it } from 'vitest';
import { normalizeMaterialShortcodes } from './material-shortcodes.js';

describe('normalizeMaterialShortcodes', () => {
  it('returns source unchanged when no md:* shortcodes', () => {
    expect(normalizeMaterialShortcodes('# Title\n\nText.\n')).toBe('# Title\n\nText.\n');
  });

  it('promotes md:version to <Badge text="Since X" variant="note">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:version 8.3.0 -->\n\nBody.\n');
    expect(out).toContain('<Badge');
    expect(out).toContain('Since 8.3.0');
    expect(out).toContain('variant="note"');
    expect(out).not.toContain('md:version');
  });

  it('promotes md:flag experimental to <Badge variant="caution">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:flag experimental -->');
    expect(out).toContain('<Badge');
    expect(out).toContain('Experimental');
    expect(out).toContain('variant="caution"');
  });

  it('promotes md:flag deprecated to <Badge variant="danger">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:flag deprecated -->');
    expect(out).toContain('<Badge');
    expect(out).toContain('Deprecated');
    expect(out).toContain('variant="danger"');
  });

  it('promotes md:flag required to <Badge variant="caution">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:flag required -->');
    expect(out).toContain('Required');
    expect(out).toContain('variant="caution"');
  });

  it('promotes md:default with value to <Badge text="Default: X">', () => {
    const out = normalizeMaterialShortcodes("<!-- md:default 'foo' -->");
    expect(out).toContain('<Badge');
    expect(out).toContain('Default: foo');
  });

  it('promotes md:default none to <Badge text="No default">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:default none -->');
    expect(out).toContain('No default');
  });

  it('promotes md:default (no args) to <Badge text="Default">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:default -->');
    expect(out).toContain('Default');
  });

  it('promotes md:sponsors to <Badge variant="tip">', () => {
    const out = normalizeMaterialShortcodes('<!-- md:sponsors -->');
    expect(out).toContain('Sponsors');
    expect(out).toContain('variant="tip"');
  });

  it('promotes md:option, md:setting, md:plugin with prefixed text', () => {
    const out = normalizeMaterialShortcodes(
      [
        '<!-- md:option foo -->',
        '<!-- md:setting plugins.bar -->',
        '<!-- md:plugin search -->',
      ].join('\n'),
    );
    expect(out).toContain('Option: foo');
    expect(out).toContain('Setting: plugins.bar');
    expect(out).toContain('Plugin: search');
    // All three emit <Badge> JSX
    expect((out.match(/<Badge/g) ?? []).length).toBe(3);
  });

  it('promotes unknown shortcodes with capitalized kind + args', () => {
    const out = normalizeMaterialShortcodes('<!-- md:custom whatever -->');
    expect(out).toContain('Custom: whatever');
    expect(out).toContain('<Badge');
  });

  it('escapes HTML special chars in args so the JSX attribute is safe', () => {
    const out = normalizeMaterialShortcodes("<!-- md:default 'a\"b' -->");
    // Double-quote inside the text= attribute must be escaped
    expect(out).not.toMatch(/text="[^"]*"[^"]/);
  });

  it('idempotent: second pass leaves <Badge> output untouched', () => {
    const src = '<!-- md:version 8.3.0 -->';
    const first = normalizeMaterialShortcodes(src);
    expect(normalizeMaterialShortcodes(first)).toBe(first);
  });
});
