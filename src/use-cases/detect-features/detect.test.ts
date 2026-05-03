import { describe, expect, it } from 'vitest';
import { detectFeatures } from './detect.js';

describe('detectFeatures', () => {
  it('returns an empty set for plain prose', () => {
    expect(detectFeatures('# Heading\n\nA paragraph.\n')).toEqual(new Set());
  });

  it('detects math from a $$...$$ block', () => {
    const src = 'Some text.\n\n$$\n\\cos x = 1\n$$\n';
    expect(detectFeatures(src).has('math')).toBe(true);
  });

  it('detects math from inline $...$ delimiters', () => {
    const src = 'Let $x = 5$ in this equation.\n';
    expect(detectFeatures(src).has('math')).toBe(true);
  });

  it('does NOT detect math from a bare $5 currency marker', () => {
    const src = 'It costs $5 or $10 — cheap.\n';
    expect(detectFeatures(src).has('math')).toBe(false);
  });

  it('detects mermaid from a ```mermaid fenced block', () => {
    const src = '```mermaid\ngraph LR; A-->B\n```\n';
    expect(detectFeatures(src).has('mermaid')).toBe(true);
  });

  it('does NOT detect mermaid from a non-mermaid code block', () => {
    const src = '```js\nconst graph = "mermaid";\n```\n';
    expect(detectFeatures(src).has('mermaid')).toBe(false);
  });

  it('returns both features when both are present', () => {
    const src = [
      'Math: $x = 1$',
      '',
      '```mermaid',
      'graph LR; A-->B',
      '```',
      '',
    ].join('\n');
    const features = detectFeatures(src);
    expect(features.has('math')).toBe(true);
    expect(features.has('mermaid')).toBe(true);
  });
});
