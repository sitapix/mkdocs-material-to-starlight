import { describe, expect, it } from 'vitest';
import { scanHeadingBadges } from './scan-heading-badges.js';

describe('scanHeadingBadges', () => {
  it('emits one diagnostic per heading with at least one attr_list class', () => {
    const src = [
      '# Foo { .badge }',
      '## Bar { #bar .pill }',
      '### Baz { .new }',
      '#### Plain heading',
      '##### Anchor only { #anchor-only }',
      '',
    ].join('\n');
    const diags = scanHeadingBadges(src);
    expect(diags.length).toBe(3);
    expect(diags.every((d) => d.ruleId === 'heading-badge-class-detected')).toBe(true);
  });

  it('captures the line number of each occurrence', () => {
    const src = ['# H1 plain', '## H2 { .badge }', '', '### H3 { .new }', ''].join('\n');
    const diags = scanHeadingBadges(src);
    expect(diags).toHaveLength(2);
    expect(diags[0]?.place?.line).toBe(2);
    expect(diags[1]?.place?.line).toBe(4);
  });

  it('does not detect classes on headings inside fenced code blocks', () => {
    const src = ['```', '## Code Heading { .badge }', '```', ''].join('\n');
    expect(scanHeadingBadges(src)).toHaveLength(0);
  });

  it('does not detect attr_list with only an explicit id (no class)', () => {
    const src = '## Foo { #foo }\n';
    expect(scanHeadingBadges(src)).toHaveLength(0);
  });

  it('does not detect attr_list with only key=value pairs (no class)', () => {
    const src = '## Foo { data-something="x" }\n';
    expect(scanHeadingBadges(src)).toHaveLength(0);
  });

  it('emits diagnostic when heading mixes id and class', () => {
    const src = '## Foo { #foo .badge }\n';
    expect(scanHeadingBadges(src)).toHaveLength(1);
  });

  it('mentions starlight-heading-badges in the message', () => {
    const src = '## Foo { .badge }\n';
    const [diag] = scanHeadingBadges(src);
    expect(diag?.message).toMatch(/starlight-heading-badges/);
  });

  it('returns an empty array for source with no headings', () => {
    expect(scanHeadingBadges('Just a paragraph.\n')).toHaveLength(0);
  });

  it('handles ATX levels 1 through 6', () => {
    const src = [
      '# A { .x }',
      '## B { .x }',
      '### C { .x }',
      '#### D { .x }',
      '##### E { .x }',
      '###### F { .x }',
      '',
    ].join('\n');
    expect(scanHeadingBadges(src)).toHaveLength(6);
  });
});
