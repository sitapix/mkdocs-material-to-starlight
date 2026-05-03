import { describe, expect, it } from 'vitest';
import { scanHeadingAnchors } from './scan-heading-anchors.js';

describe('scanHeadingAnchors', () => {
  it('returns empty array for headings without attr_list', () => {
    expect(scanHeadingAnchors('# Title\n\n## Subtitle\n')).toHaveLength(0);
  });

  it('detects a single { #slug } and emits a diagnostic', () => {
    const diags = scanHeadingAnchors('# Title { #my-anchor }\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('heading-explicit-id-stripped');
    expect(diags[0]?.severity).toBe('info');
    expect(diags[0]?.message).toContain('my-anchor');
    expect(diags[0]?.message).toContain('Title');
    expect(diags[0]?.place?.line).toBe(1);
  });

  it('detects multiple headings with anchors', () => {
    const source = '# A { #anchor-a }\n\n## B { #anchor-b }\n';
    const diags = scanHeadingAnchors(source);
    expect(diags).toHaveLength(2);
  });

  it('skips headings inside fenced code blocks', () => {
    const source = '```\n# Fake { #not-real }\n```\n';
    expect(scanHeadingAnchors(source)).toHaveLength(0);
  });

  it('skips attr_list without an id (#) entry', () => {
    const source = '# Title { .class }\n';
    expect(scanHeadingAnchors(source)).toHaveLength(0);
  });

  it('extracts the first # id from a multi-token attr_list', () => {
    const source = '# Title { #slug .class data-x="y" }\n';
    const diags = scanHeadingAnchors(source);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('slug');
  });
});
