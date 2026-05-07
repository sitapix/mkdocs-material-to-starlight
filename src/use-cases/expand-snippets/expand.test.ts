import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { expandSnippets } from './expand.js';

function makeFs(files: Record<string, string>): FileSystem {
  return {
    async readText(path) {
      const content = files[path];
      if (content === undefined) {
        return err({ code: 'not-found', path, message: `not found: ${path}` });
      }
      return ok(content);
    },
    async exists(path) {
      return Object.hasOwn(files, path);
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

describe('expandSnippets', () => {
  it('passes through text with no snippets unchanged', async () => {
    const fs = makeFs({});
    const result = await expandSnippets({
      source: '# Heading\n\nplain.\n',
      basePaths: ['docs'],
      fs,
    });
    expect(result.text).toBe('# Heading\n\nplain.\n');
    expect(result.diagnostics).toEqual([]);
  });

  it('inlines a single snippet at the right line', async () => {
    const fs = makeFs({ 'docs/intro.md': 'shared body' });
    const result = await expandSnippets({
      source: 'before\n\n--8<-- "intro.md"\n\nafter\n',
      basePaths: ['docs'],
      fs,
    });
    expect(result.text).toBe('before\n\nshared body\n\nafter\n');
    expect(result.diagnostics).toEqual([]);
  });

  it('inlines multiple snippets in order', async () => {
    const fs = makeFs({
      'docs/a.md': 'A',
      'docs/b.md': 'B',
    });
    const result = await expandSnippets({
      source: '--8<-- "a.md"\n\nmid\n\n--8<-- "b.md"\n',
      basePaths: ['docs'],
      fs,
    });
    expect(result.text).toBe('A\n\nmid\n\nB\n');
  });

  it('expands a snippet recursively (snippet inside a snippet)', async () => {
    const fs = makeFs({
      'docs/outer.md': 'outer-pre\n\n--8<-- "inner.md"\n\nouter-post',
      'docs/inner.md': 'inner content',
    });
    const result = await expandSnippets({
      source: '--8<-- "outer.md"\n',
      basePaths: ['docs'],
      fs,
    });
    expect(result.text).toBe('outer-pre\n\ninner content\n\nouter-post\n');
    expect(result.diagnostics).toEqual([]);
  });

  it('reports a diagnostic when a snippet is not found, leaves the marker intact', async () => {
    const fs = makeFs({});
    const result = await expandSnippets({
      source: 'before\n\n--8<-- "missing.md"\n\nafter\n',
      basePaths: ['docs'],
      fs,
    });
    expect(result.text).toBe('before\n\n--8<-- "missing.md"\n\nafter\n');
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.ruleId).toBe('snippet-not-found');
    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.message).toContain('missing.md');
  });

  it('detects and breaks a direct cycle with a diagnostic', async () => {
    const fs = makeFs({
      'docs/a.md': 'A start\n\n--8<-- "a.md"\n\nA end',
    });
    const result = await expandSnippets({
      source: '--8<-- "a.md"\n',
      basePaths: ['docs'],
      fs,
    });
    expect(result.text).toContain('A start');
    expect(result.diagnostics.some((d) => d.ruleId === 'snippet-cycle')).toBe(true);
  });

  it('enforces a depth limit and reports a diagnostic when exceeded', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 12; i += 1) {
      files[`docs/level${i}.md`] = `level ${i}\n\n--8<-- "level${i + 1}.md"`;
    }
    const fs = makeFs(files);
    const result = await expandSnippets({
      source: '--8<-- "level0.md"\n',
      basePaths: ['docs'],
      fs,
      maxDepth: 3,
    });
    expect(result.diagnostics.some((d) => d.ruleId === 'snippet-depth-exceeded')).toBe(true);
  });

  it('is idempotent — expanding twice produces the same text as expanding once', async () => {
    const fs = makeFs({ 'docs/foo.md': 'inlined body' });
    const first = await expandSnippets({
      source: 'pre\n\n--8<-- "foo.md"\n\npost\n',
      basePaths: ['docs'],
      fs,
    });
    const second = await expandSnippets({
      source: first.text,
      basePaths: ['docs'],
      fs,
    });
    expect(second.text).toBe(first.text);
  });

  describe('block-form snippets', () => {
    it('expands a multi-file block in document order', async () => {
      const fs = makeFs({
        'docs/a.md': 'first body',
        'docs/b.md': 'second body',
      });
      const src = ['Pre.', '', '--8<--', 'a.md', 'b.md', '--8<--', '', 'Post.', ''].join('\n');
      const result = await expandSnippets({
        source: src,
        basePaths: ['docs'],
        fs,
      });
      const aIdx = result.text.indexOf('first body');
      const bIdx = result.text.indexOf('second body');
      expect(aIdx).toBeGreaterThan(-1);
      expect(bIdx).toBeGreaterThan(aIdx);
      expect(result.text).toContain('Pre.');
      expect(result.text).toContain('Post.');
      expect(result.text).not.toContain('--8<--');
      expect(result.diagnostics).toEqual([]);
    });

    it('skips entries prefixed with ; and emits a diagnostic info', async () => {
      const fs = makeFs({
        'docs/a.md': 'kept',
        'docs/b.md': 'dropped',
      });
      const src = ['--8<--', 'a.md', ';b.md', '--8<--', ''].join('\n');
      const result = await expandSnippets({
        source: src,
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('kept');
      expect(result.text).not.toContain('dropped');
    });

    it('emits a snippet-not-found diagnostic for missing block entries', async () => {
      const fs = makeFs({ 'docs/a.md': 'body' });
      const src = ['--8<--', 'a.md', 'missing.md', '--8<--', ''].join('\n');
      const result = await expandSnippets({
        source: src,
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('body');
      expect(
        result.diagnostics.some(
          (d) => d.ruleId === 'snippet-not-found' && d.message.includes('missing.md'),
        ),
      ).toBe(true);
    });

    it('inlines only the requested line range (file.md:start:end)', async () => {
      const fs = makeFs({
        'docs/big.md': 'L1\nL2\nL3\nL4\nL5\n',
      });
      const result = await expandSnippets({
        source: '--8<-- "big.md:2:4"\n',
        basePaths: ['docs'],
        fs,
      });
      // Lines 2..4 inclusive (1-based per pymdownx semantics).
      expect(result.text).toContain('L2');
      expect(result.text).toContain('L3');
      expect(result.text).toContain('L4');
      expect(result.text).not.toContain('L1');
      expect(result.text).not.toContain('L5');
      expect(result.diagnostics).toEqual([]);
    });

    it('inlines from a start line to the end of file (file.md:start)', async () => {
      const fs = makeFs({
        'docs/big.md': 'L1\nL2\nL3\nL4\n',
      });
      const result = await expandSnippets({
        source: '--8<-- "big.md:3"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('L3');
      expect(result.text).toContain('L4');
      expect(result.text).not.toContain('L1');
      expect(result.text).not.toContain('L2');
    });

    it('inlines a named section (file.md:section_name)', async () => {
      const fs = makeFs({
        'docs/sectioned.md': [
          'preamble',
          '# --8<-- [start:hello]',
          'hello body line 1',
          'hello body line 2',
          '# --8<-- [end:hello]',
          'epilogue',
          '',
        ].join('\n'),
      });
      const result = await expandSnippets({
        source: '--8<-- "sectioned.md:hello"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('hello body line 1');
      expect(result.text).toContain('hello body line 2');
      expect(result.text).not.toContain('preamble');
      expect(result.text).not.toContain('epilogue');
      // Section markers themselves must not survive the expansion.
      expect(result.text).not.toContain('[start:hello]');
      expect(result.text).not.toContain('[end:hello]');
    });

    it('emits a diagnostic when a named section is not found', async () => {
      const fs = makeFs({ 'docs/sectioned.md': 'body without markers\n' });
      const result = await expandSnippets({
        source: '--8<-- "sectioned.md:missing"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(
        result.diagnostics.some(
          (d) => d.ruleId === 'snippet-section-not-found' && d.message.includes('missing'),
        ),
      ).toBe(true);
    });

    it('handles end-only ranges :: (lines 1..N)', async () => {
      const fs = makeFs({
        'docs/multi.md': ['line1', 'line2', 'line3', 'line4', ''].join('\n'),
      });
      const result = await expandSnippets({
        source: '--8<-- "multi.md::2"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('line1');
      expect(result.text).toContain('line2');
      expect(result.text).not.toContain('line3');
    });

    it('handles comma-separated multi-range :1:2,4:4', async () => {
      const fs = makeFs({
        'docs/multi.md': ['a', 'b', 'c', 'd', 'e', ''].join('\n'),
      });
      const result = await expandSnippets({
        source: '--8<-- "multi.md:1:2,4:4"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('a');
      expect(result.text).toContain('b');
      expect(result.text).toContain('d');
      expect(result.text).not.toContain('c');
      expect(result.text).not.toContain('e');
    });

    it('handles negative line indexes (-1 = last line)', async () => {
      const fs = makeFs({
        'docs/multi.md': ['a', 'b', 'c', 'd', ''].join('\n'),
      });
      const result = await expandSnippets({
        source: '--8<-- "multi.md:-2:-1"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('c');
      expect(result.text).toContain('d');
      expect(result.text).not.toContain('a');
    });

    it('clamps line 0 to line 1', async () => {
      const fs = makeFs({
        'docs/multi.md': ['a', 'b', 'c', ''].join('\n'),
      });
      const result = await expandSnippets({
        source: '--8<-- "multi.md:0:2"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.text).toContain('a');
      expect(result.text).toContain('b');
    });

    it('emits snippet-url-not-supported for http(s) URLs', async () => {
      const fs = makeFs({});
      const result = await expandSnippets({
        source: '--8<-- "https://example.com/snippet.md"\n',
        basePaths: ['docs'],
        fs,
      });
      expect(result.diagnostics.some((d) => d.ruleId === 'snippet-url-not-supported')).toBe(true);
      expect(result.text).toContain('https://example.com/snippet.md');
    });

    it('dedentSubsections: strips common leading whitespace from extracted section', async () => {
      const fs = makeFs({
        'docs/example.py': [
          '# top',
          '# --8<-- [start:func]',
          '    def hello():',
          '        return 42',
          '# --8<-- [end:func]',
          '',
        ].join('\n'),
      });
      const withDedent = await expandSnippets({
        source: '--8<-- "example.py:func"\n',
        basePaths: ['docs'],
        fs,
        dedentSubsections: true,
      });
      expect(withDedent.text).toContain('def hello():');
      expect(withDedent.text).toContain('    return 42');
      expect(withDedent.text).not.toContain('        return 42');
    });

    it('dedentSubsections: does NOT dedent full-file inclusion', async () => {
      const fs = makeFs({ 'docs/leaf.md': '    pre-indented\n' });
      const result = await expandSnippets({
        source: '--8<-- "leaf.md"\n',
        basePaths: ['docs'],
        fs,
        dedentSubsections: true,
      });
      expect(result.text).toContain('    pre-indented');
    });

    it('reports an unclosed block as a malformed-snippet diagnostic', async () => {
      const fs = makeFs({});
      const src = ['Pre.', '', '--8<--', 'orphan.md', 'Post.', ''].join('\n');
      const result = await expandSnippets({
        source: src,
        basePaths: ['docs'],
        fs,
      });
      expect(result.diagnostics.some((d) => d.ruleId === 'snippet-malformed')).toBe(true);
    });
  });
});
