import { describe, expect, it } from 'vitest';
import { scanPlaceholderPage } from './scan-placeholder-pages.js';

describe('scanPlaceholderPage', () => {
  it('detects a Material monorepo-plugin placeholder page', () => {
    const src = [
      '# Python Gitlab Management',
      '',
      "| 🔴 This page is a placeholder for the python-gitlab-management repo's docs. |",
      '| :--- |',
      '| _If you can see this page there has been an error, please report the issue on gitlab_ |',
      '',
    ].join('\n');
    const out = scanPlaceholderPage(src);
    expect(out).not.toBeNull();
    expect(out?.ruleId).toBe('placeholder-page-detected');
    expect(out?.severity).toBe('warning');
    expect(out?.message).toContain('placeholder');
  });

  it('detects the lowercase variant without emoji', () => {
    const src = "This page is a placeholder for the docs repo's content.\n";
    expect(scanPlaceholderPage(src)).not.toBeNull();
  });

  it('detects the "you are seeing this in error" variant', () => {
    const src = [
      '# Foo',
      '',
      'If you can see this page there has been an error, please report the issue on gitlab',
    ].join('\n');
    expect(scanPlaceholderPage(src)).not.toBeNull();
  });

  it('does not flag pages with normal content', () => {
    const src = '# Real Page\n\nThis page has actual documentation content.\n';
    expect(scanPlaceholderPage(src)).toBeNull();
  });

  it('does not flag pages that mention "placeholder" incidentally', () => {
    // A real doc page may mention placeholders in context (e.g. CSS variable
    // placeholders). The detector should require BOTH the placeholder phrasing
    // AND a "report the error" or "for the X repo" qualifier so we don't
    // false-positive on prose.
    const src = '# CSS Variables\n\nUse `--placeholder-color` to style placeholders.\n';
    expect(scanPlaceholderPage(src)).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(scanPlaceholderPage('')).toBeNull();
  });
});
