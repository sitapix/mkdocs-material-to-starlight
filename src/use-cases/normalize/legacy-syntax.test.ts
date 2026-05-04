import { describe, expect, it } from 'vitest';
import { normalizeLegacySyntax } from './legacy-syntax.js';

describe('normalizeLegacySyntax', () => {
  it('passes plain markdown through unchanged', () => {
    const src = '# Heading\n\nA plain paragraph.\n';
    expect(normalizeLegacySyntax(src)).toBe(src);
  });

  describe('<span id="…"> anchor stripping', () => {
    it('strips a <span> opener at the start of a heading', () => {
      const src = '## <span id="foo"> Title\n';
      expect(normalizeLegacySyntax(src)).toBe('## Title\n');
    });

    it('strips a <span> opener at the start of a list item', () => {
      const src = '- <span id="foo"> An item\n';
      expect(normalizeLegacySyntax(src)).toBe('- An item\n');
    });

    it('strips a paired <span>...</span> wrapper around heading text', () => {
      const src = '### <span class="anchor">SQLConf</span>\n';
      expect(normalizeLegacySyntax(src)).toBe('### SQLConf\n');
    });

    it('strips multiple stacked <span> openers (Material multi-anchor idiom)', () => {
      const src = '## <span id="A"><span id="B"> heading\n';
      expect(normalizeLegacySyntax(src)).toBe('## heading\n');
    });

    it('does not touch <span> inside fenced code', () => {
      const src = ['```html', '<span id="foo">x</span>', '```', ''].join('\n');
      expect(normalizeLegacySyntax(src)).toBe(src);
    });

    it('strips <span> at start of a paragraph (no markdown prefix)', () => {
      const src = '<span id="x"> some prose\n';
      expect(normalizeLegacySyntax(src)).toBe('some prose\n');
    });
  });

  describe('Asciidoc cross-reference <<page#anchor, label>>', () => {
    it('rewrites <<anchor, label>> to a same-page link', () => {
      const src = 'See <<addBatch, stores in memory>> for more.\n';
      expect(normalizeLegacySyntax(src)).toBe(
        'See [stores in memory](#addBatch) for more.\n',
      );
    });

    it('rewrites <<page.md#anchor, label>> to a cross-page link', () => {
      const src =
        'See <<physical/Foo.md#processBatch, process the batch>> next.\n';
      const out = normalizeLegacySyntax(src);
      expect(out).toBe(
        'See [process the batch](physical/Foo.md#processBatch) next.\n',
      );
    });

    it('rewrites bare <<anchor>> (no label) to [anchor](#anchor)', () => {
      const src = 'jump to <<latestBatchId>> for details\n';
      expect(normalizeLegacySyntax(src)).toBe(
        'jump to [latestBatchId](#latestBatchId) for details\n',
      );
    });

    it('does not touch <<EOF or shell heredoc inside code', () => {
      const src = ['```bash', 'cat <<EOF', 'hello', 'EOF', '```', ''].join('\n');
      expect(normalizeLegacySyntax(src)).toBe(src);
    });
  });

  describe('Asciidoc inline anchor [[id]]', () => {
    it('strips [[anchor]] from the start of an asciidoc heading line', () => {
      const src = '=== [[addBatch]] Adding Batch of Data\n';
      const out = normalizeLegacySyntax(src);
      // The asciidoc `===` marker stays as-is (other normalizers handle it),
      // but the [[anchor]] tag is removed.
      expect(out).not.toContain('[[addBatch]]');
      expect(out).toContain('Adding Batch of Data');
    });

    it('strips standalone [[anchor]] in prose', () => {
      const src = 'before [[my-anchor]] after\n';
      expect(normalizeLegacySyntax(src)).toBe('before  after\n');
    });

    it('does not touch TOML [[tool.uv.index]] inside code fences', () => {
      const src = ['```toml', '[[tool.uv.index]]', 'name = "x"', '```', ''].join('\n');
      expect(normalizeLegacySyntax(src)).toBe(src);
    });

    it('does not touch markdown reference-style links [text][label]', () => {
      const src = '[link][label]\n\n[label]: https://x\n';
      expect(normalizeLegacySyntax(src)).toBe(src);
    });
  });

  it('is idempotent', () => {
    const src = [
      '## <span id="x"> Title',
      '',
      'See <<other.md#anchor, label>> for details.',
      '',
      '=== [[id]] heading',
      '',
    ].join('\n');
    const once = normalizeLegacySyntax(src);
    expect(normalizeLegacySyntax(once)).toBe(once);
  });
});
