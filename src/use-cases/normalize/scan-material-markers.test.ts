import { describe, expect, it } from 'vitest';
import { scanMaterialMarkers } from './scan-material-markers.js';

describe('scanMaterialMarkers', () => {
  it('returns no diagnostics for source with no Material-specific markers', () => {
    expect(scanMaterialMarkers('# Heading\n\nA paragraph.\n')).toHaveLength(0);
  });

  describe('<!-- material/tags --> index marker', () => {
    it('emits a warning when a bare tags marker is present', () => {
      const src = '# Tags\n\n<!-- material/tags -->\n';
      const diags = scanMaterialMarkers(src);
      const tagDiag = diags.find((d) => d.ruleId === 'material-tags-marker-detected');
      expect(tagDiag).toBeDefined();
      expect(tagDiag?.severity).toBe('warning');
      expect(tagDiag?.message).toMatch(/starlight-tags/);
    });

    it('emits a warning when a parameterized tags marker is present', () => {
      const src = '<!-- material/tags { scope: true, include: [Foo] } -->\n';
      const diags = scanMaterialMarkers(src);
      expect(diags.find((d) => d.ruleId === 'material-tags-marker-detected')).toBeDefined();
    });

    it('does not match the marker inside fenced code', () => {
      const src = '```\n<!-- material/tags -->\n```\n';
      expect(
        scanMaterialMarkers(src).find((d) => d.ruleId === 'material-tags-marker-detected'),
      ).toBeUndefined();
    });
  });

  describe('comments: true frontmatter', () => {
    it('emits an info diagnostic when comments: true appears in frontmatter', () => {
      const src = ['---', 'title: Hello', 'comments: true', '---', '', 'body'].join('\n');
      const diags = scanMaterialMarkers(src);
      const cDiag = diags.find((d) => d.ruleId === 'comments-frontmatter-detected');
      expect(cDiag).toBeDefined();
      expect(cDiag?.severity).toBe('info');
      expect(cDiag?.message).toMatch(/giscus/i);
    });

    it('does not emit when comments is false or absent', () => {
      const src = ['---', 'title: Hello', '---', '', 'body'].join('\n');
      const diags = scanMaterialMarkers(src);
      expect(diags.find((d) => d.ruleId === 'comments-frontmatter-detected')).toBeUndefined();
    });

    it('only matches when the value is exactly true (not a substring)', () => {
      const src = ['---', 'description: comments true here', '---', '', 'body'].join('\n');
      const diags = scanMaterialMarkers(src);
      expect(diags.find((d) => d.ruleId === 'comments-frontmatter-detected')).toBeUndefined();
    });
  });

  describe('<!-- more --> excerpt separator', () => {
    it('emits an info diagnostic when the more marker is present', () => {
      const src = ['Intro paragraph.', '', '<!-- more -->', '', 'Rest of post.', ''].join('\n');
      const diags = scanMaterialMarkers(src);
      const d = diags.find((x) => x.ruleId === 'blog-more-marker-detected');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('info');
      expect(d?.message).toMatch(/excerpt|starlight-blog/i);
    });

    it('does not match when the marker is inside fenced code', () => {
      const src = ['```', '<!-- more -->', '```', ''].join('\n');
      expect(
        scanMaterialMarkers(src).find((x) => x.ruleId === 'blog-more-marker-detected'),
      ).toBeUndefined();
    });

    it('does not match other HTML comments', () => {
      const src = '<!-- some other comment -->\n';
      expect(
        scanMaterialMarkers(src).find((x) => x.ruleId === 'blog-more-marker-detected'),
      ).toBeUndefined();
    });
  });

  it('emits both diagnostics when both markers are present in the same file', () => {
    const src = [
      '---',
      'title: Hello',
      'comments: true',
      '---',
      '',
      'body',
      '',
      '<!-- material/tags -->',
      '',
    ].join('\n');
    const diags = scanMaterialMarkers(src);
    const ids = diags.map((d) => d.ruleId).sort();
    expect(ids).toEqual(['comments-frontmatter-detected', 'material-tags-marker-detected']);
  });
});
