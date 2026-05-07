import { describe, expect, it } from 'vitest';
import {
  scanCodeBlockOptOuts,
  scanCodehiliteLinenumsOccurrences,
  scanLatexDelimiters,
  scanMathScripts,
  scanMetaYmlFiles,
  scanTabsLinkOccurrences,
} from './scan-bulk-diagnostics.js';

describe('scanTabsLinkOccurrences', () => {
  it('returns a diagnostic for each file containing a === tab block', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/page1.md', '=== "Tab A"\n    content\n\n=== "Tab B"\n    content\n'],
      ['docs/page2.md', '# No tabs here\n\nJust content.\n'],
      ['docs/page3.md', '=== "Install"\n    npm install\n'],
    ];
    const results = scanTabsLinkOccurrences(files);
    expect(results).toHaveLength(2);
    expect(results[0]?.sourcePath).toBe('docs/page1.md');
    expect(results[0]?.diagnostic.ruleId).toBe('feature-tabs-link-occurrence');
    expect(results[1]?.sourcePath).toBe('docs/page3.md');
  });

  it('returns empty array when no files have tabs', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/page.md', '# Just a heading\n\nParagraph.\n'],
    ];
    expect(scanTabsLinkOccurrences(files)).toHaveLength(0);
  });
});

describe('scanCodehiliteLinenumsOccurrences', () => {
  it('returns a diagnostic for each file with a linenums code fence', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/page1.md', '```python linenums="1"\ncode\n```\n'],
      ['docs/page2.md', '# No linenums\n\n```python\ncode\n```\n'],
      ['docs/page3.md', '```js linenums="1"\nconsole.log("hi")\n```\n'],
    ];
    const results = scanCodehiliteLinenumsOccurrences(files);
    expect(results).toHaveLength(2);
    expect(results[0]?.sourcePath).toBe('docs/page1.md');
    expect(results[0]?.diagnostic.ruleId).toBe('extension-codehilite-linenums-occurrence');
    expect(results[1]?.sourcePath).toBe('docs/page3.md');
  });

  it('returns empty array when no files have linenums fences', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/page.md', '```python\ncode\n```\n'],
    ];
    expect(scanCodehiliteLinenumsOccurrences(files)).toHaveLength(0);
  });
});

describe('scanMetaYmlFiles', () => {
  it('returns a diagnostic for each .meta.yml file found', () => {
    const metaFiles: ReadonlyArray<readonly [string, string]> = [
      ['docs/.meta.yml', 'title: Section Title\n'],
      ['docs/api/.meta.yml', 'template: doc\n'],
    ];
    const results = scanMetaYmlFiles(metaFiles);
    expect(results).toHaveLength(2);
    expect(results[0]?.sourcePath).toBe('docs/.meta.yml');
    expect(results[0]?.diagnostic.ruleId).toBe('plugin-meta-config-detected');
    expect(results[1]?.sourcePath).toBe('docs/api/.meta.yml');
  });

  it('returns empty array when no .meta.yml files exist', () => {
    expect(scanMetaYmlFiles([])).toHaveLength(0);
  });

  it('includes file content summary in the diagnostic message', () => {
    const metaFiles: ReadonlyArray<readonly [string, string]> = [
      ['docs/.meta.yml', 'title: My Section\ntemplate: doc\n'],
    ];
    const results = scanMetaYmlFiles(metaFiles);
    expect(results[0]?.diagnostic.message).toContain('.meta.yml');
  });
});

describe('scanCodeBlockOptOuts', () => {
  it('emits a warning for each file containing { .lang .no-copy } fences', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/a.md', '``` { .yaml .no-copy }\nkey: value\n```\n'],
      ['docs/b.md', '```python\nprint(1)\n```\n'],
      ['docs/c.md', '``` { .js .no-select }\nconsole.log(1)\n```\n'],
    ];
    const out = scanCodeBlockOptOuts(files);
    expect(out).toHaveLength(2);
    expect(out[0]?.sourcePath).toBe('docs/a.md');
    expect(out[0]?.diagnostic.ruleId).toBe('code-block-opt-out-dropped');
    expect(out[0]?.diagnostic.severity).toBe('warning');
    expect(out[0]?.diagnostic.message).toContain('.no-copy');
    expect(out[1]?.sourcePath).toBe('docs/c.md');
    expect(out[1]?.diagnostic.message).toContain('.no-select');
  });

  it('returns empty array when no fence has a no-copy or no-select marker', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/a.md', '```python\nprint(1)\n```\n'],
      ['docs/b.md', '``` { .yaml .copy }\nkey: value\n```\n'],
    ];
    expect(scanCodeBlockOptOuts(files)).toHaveLength(0);
  });

  it('matches both markers in a single file with one diagnostic per file', () => {
    const files: ReadonlyArray<readonly [string, string]> = [
      ['docs/x.md', '``` { .yaml .no-copy }\nfoo\n```\n\n``` { .js .no-select }\nbar\n```\n'],
    ];
    const out = scanCodeBlockOptOuts(files);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('.no-copy');
    expect(out[0]?.diagnostic.message).toContain('.no-select');
  });
});

describe('scanLatexDelimiters', () => {
  it('emits a warning when a file uses \\(...\\) inline LaTeX delimiters', () => {
    const out = scanLatexDelimiters([
      ['docs/page.md', 'When \\(x = 1\\) holds, the result follows.\n'],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.sourcePath).toBe('docs/page.md');
    expect(out[0]?.diagnostic.ruleId).toBe('latex-delimiter-unsupported');
    expect(out[0]?.diagnostic.severity).toBe('warning');
    expect(out[0]?.diagnostic.message).toContain('\\(');
  });

  it('emits a warning when a file uses \\[...\\] block LaTeX delimiters', () => {
    const out = scanLatexDelimiters([['docs/page.md', 'Equation:\n\\[\nE = mc^2\n\\]\nDone.\n']]);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('\\[');
  });

  it('lists both forms when both appear in the same file (one diagnostic per file)', () => {
    const out = scanLatexDelimiters([['docs/page.md', 'Inline \\(x\\) and block:\n\\[y = 2\\]\n']]);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('\\(');
    expect(out[0]?.diagnostic.message).toContain('\\[');
  });

  it('returns empty array when source uses only $...$ / $$...$$ (remark-math defaults)', () => {
    expect(
      scanLatexDelimiters([['docs/page.md', 'Use $x = 1$ or $$y = 2$$ — these work.\n']]),
    ).toHaveLength(0);
  });

  it('does not match a literal \\\\( escape sequence (escaped backslash)', () => {
    expect(
      scanLatexDelimiters([['docs/page.md', 'Path on Windows: C:\\\\(temp)\\\\file\n']]),
    ).toHaveLength(0);
  });

  it('returns empty array for files containing no math markup at all', () => {
    expect(scanLatexDelimiters([['docs/page.md', '# Just a heading\n\nProse.\n']])).toHaveLength(0);
  });
});

describe('scanMathScripts', () => {
  it('emits an info diagnostic for a MathJax extra_javascript entry', () => {
    const out = scanMathScripts(['docs/javascripts/mathjax.js']);
    expect(out).toHaveLength(1);
    expect(out[0]?.sourcePath).toBe('docs/javascripts/mathjax.js');
    expect(out[0]?.diagnostic.ruleId).toBe('math-runtime-script-superseded');
    expect(out[0]?.diagnostic.severity).toBe('info');
    expect(out[0]?.diagnostic.message).toContain('MathJax');
    expect(out[0]?.diagnostic.message).toContain('rehype-katex');
  });

  it('emits an info diagnostic for a KaTeX extra_javascript entry', () => {
    const out = scanMathScripts(['docs/javascripts/katex.js']);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.message).toContain('KaTeX');
  });

  it('matches case-insensitively (MathJax.JS, KATEX-config.js)', () => {
    const out = scanMathScripts(['js/MathJax.JS', 'js/Katex-config.js']);
    expect(out).toHaveLength(2);
  });

  it('returns empty array when no entry references mathjax or katex', () => {
    expect(scanMathScripts(['js/custom.js', 'js/analytics.js'])).toHaveLength(0);
  });

  it('does not match unrelated paths that contain similar substrings', () => {
    // "mathjax" must be a word boundary — these should NOT match.
    expect(scanMathScripts(['js/notmathjaxx.js', 'js/katexish-tools.js'])).toHaveLength(0);
  });
});
