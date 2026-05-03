import { describe, expect, it } from 'vitest';
import { extractExtraAssets } from './extra-assets.js';

describe('extractExtraAssets', () => {
  it('returns empty arrays when nothing is configured', () => {
    expect(extractExtraAssets({})).toEqual({ css: [], js: [] });
  });

  it('extracts extra_css string list', () => {
    const out = extractExtraAssets({
      extra_css: ['css/custom.css', 'css/termynal.css'],
    });
    expect(out.css).toEqual(['css/custom.css', 'css/termynal.css']);
  });

  it('extracts extra_javascript string list', () => {
    const out = extractExtraAssets({
      extra_javascript: ['js/custom.js'],
    });
    expect(out.js).toEqual([
      { src: 'js/custom.js' },
    ]);
  });

  it('extracts extra_javascript object form with type, async, defer', () => {
    const out = extractExtraAssets({
      extra_javascript: [
        { path: 'js/module.js', type: 'module', async: true, defer: false },
      ],
    });
    expect(out.js).toEqual([
      { src: 'js/module.js', type: 'module', async: true },
    ]);
  });

  it('omits unset attrs from JS entries', () => {
    const out = extractExtraAssets({
      extra_javascript: [{ path: 'js/x.js' }],
    });
    expect(out.js[0]).toEqual({ src: 'js/x.js' });
  });

  it('passes through external URLs verbatim', () => {
    const out = extractExtraAssets({
      extra_css: ['https://unpkg.com/katex@0/dist/katex.min.css'],
      extra_javascript: ['https://unpkg.com/mathjax@3/es5/tex-mml-chtml.js'],
    });
    expect(out.css[0]).toBe('https://unpkg.com/katex@0/dist/katex.min.css');
    expect(out.js[0]).toEqual({
      src: 'https://unpkg.com/mathjax@3/es5/tex-mml-chtml.js',
    });
  });

  it('skips non-string / non-object entries', () => {
    const out = extractExtraAssets({
      extra_css: ['valid.css', 42, null],
      extra_javascript: ['valid.js', 99],
    });
    expect(out.css).toEqual(['valid.css']);
    expect(out.js).toEqual([{ src: 'valid.js' }]);
  });

  it('idempotent extraction', () => {
    const extras = {
      extra_css: ['a.css', 'b.css'],
      extra_javascript: ['c.js', { path: 'd.js', type: 'module' }],
    };
    expect(extractExtraAssets(extras)).toEqual(extractExtraAssets(extras));
  });
});
