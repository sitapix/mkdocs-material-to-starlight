import { describe, expect, it } from 'vitest';
import { scanMaterialCodeCssVars } from './scan-code-css-vars.js';

describe('scanMaterialCodeCssVars', () => {
  it('emits a diagnostic for files using --md-code-hl-string-color', () => {
    const out = scanMaterialCodeCssVars([
      ['docs/stylesheets/extra.css', ':root > * {\n  --md-code-hl-string-color: #0FF1CE;\n}\n'],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.sourcePath).toBe('docs/stylesheets/extra.css');
    expect(out[0]?.diagnostic.ruleId).toBe('extra-css-code-customization-dropped');
    expect(out[0]?.diagnostic.severity).toBe('warning');
    expect(out[0]?.diagnostic.message).toContain('--md-code-hl-string-color');
    expect(out[0]?.diagnostic.message).toContain('Shiki');
  });

  it('emits a diagnostic for files using --md-code-fg-color or --md-code-bg-color', () => {
    const out = scanMaterialCodeCssVars([
      ['docs/extra.css', ':root { --md-code-fg-color: white; --md-code-bg-color: black; }\n'],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('--md-code-fg-color');
    expect(out[0]?.diagnostic.message).toContain('--md-code-bg-color');
  });

  it('emits a diagnostic for Pygments token-class selectors', () => {
    const out = scanMaterialCodeCssVars([
      ['docs/extra.css', '.highlight .sb {\n  color: #0FF1CE;\n}\n'],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('.highlight .sb');
  });

  it('detects multiple variables and tokens in the same file with one diagnostic', () => {
    const out = scanMaterialCodeCssVars([
      [
        'docs/extra.css',
        '--md-code-hl-string-color: red; .highlight .sb { color: red; } .codehilite .nf { color: blue; }',
      ],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('CSS variables');
    expect(out[0]?.diagnostic.message).toContain('Pygments token selectors');
  });

  it('returns an empty array when no Material code customization is present', () => {
    const out = scanMaterialCodeCssVars([['docs/extra.css', 'body { color: red; }\n']]);
    expect(out).toHaveLength(0);
  });

  it('returns an empty array for files using non-code Material variables (--md-primary-fg-color)', () => {
    const out = scanMaterialCodeCssVars([
      ['docs/extra.css', ':root { --md-primary-fg-color: #ff0000; }\n'],
    ]);
    expect(out).toHaveLength(0);
  });

  it('caps token-selector list at 8 with an ellipsis when there are many', () => {
    // 12 distinct Pygments token classes (real-world ones from the lexer).
    const classes = ['sb', 'sd', 'nf', 'nv', 'nb', 'nc', 'nd', 'ne', 'ni', 'nl', 'nn', 'no'];
    const tokens = classes.map((c) => `.highlight .${c} { color: red; }`).join('\n');
    const out = scanMaterialCodeCssVars([['docs/extra.css', tokens]]);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toMatch(/, …/);
  });
});
