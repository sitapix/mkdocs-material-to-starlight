import { describe, expect, it } from 'vitest';
import {
  scanTabsLinkOccurrences,
  scanCodehiliteLinenumsOccurrences,
  scanMetaYmlFiles,
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
