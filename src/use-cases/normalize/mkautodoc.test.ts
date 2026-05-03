import { describe, expect, it } from 'vitest';
import { normalizeMkautodocBlocks } from './mkautodoc.js';

describe('normalizeMkautodocBlocks', () => {
  it('passes through text containing no mkautodoc-style blocks', () => {
    const input = '# Hello\n\nJust a paragraph.\n';
    expect(normalizeMkautodocBlocks(input)).toBe(input);
  });

  it('wraps a `::: identifier` block with indented body in a fenced code block', () => {
    // mkautodoc syntax (encode/httpx api.md style):
    //   ::: httpx.request
    //       :docstring:
    //
    // Without this normalizer, remark-stringify escapes the leading `:::` and
    // `:docstring:` tokens (they round-trip as `\:::` and `\:`), producing
    // unreadable output. Wrapping in a fenced code block preserves the
    // original syntax verbatim AND round-trips cleanly.
    const input = [
      '# API',
      '',
      '::: httpx.request',
      '    :docstring:',
      '',
      'After.',
      '',
    ].join('\n');
    const output = normalizeMkautodocBlocks(input);
    expect(output).toContain('```text');
    expect(output).toContain('::: httpx.request');
    expect(output).toContain('    :docstring:');
    // The block ends before "After."
    expect(output.indexOf('```')).toBeLessThan(output.indexOf('After.'));
    // Closing fence appears too
    expect(output.match(/```/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('handles multiple consecutive mkautodoc blocks independently', () => {
    const input = [
      '::: httpx.get',
      '    :docstring:',
      '',
      '::: httpx.post',
      '    :docstring:',
      '',
    ].join('\n');
    const output = normalizeMkautodocBlocks(input);
    // Two independent fenced blocks
    expect(output.match(/^```text$/gm)?.length).toBe(2);
    expect(output).toContain('::: httpx.get');
    expect(output).toContain('::: httpx.post');
  });

  it('does not wrap `::: name` followed by NON-indented content (likely a Starlight aside)', () => {
    // Standard remark-directive container syntax uses non-indented body and a
    // closing `:::`. Those must NOT be wrapped — they are real directives the
    // downstream AST transforms should handle.
    const input = [
      ':::note',
      'This is an aside body.',
      ':::',
      '',
    ].join('\n');
    const output = normalizeMkautodocBlocks(input);
    expect(output).toBe(input);
  });

  it('does not wrap a bare `:::` line with no identifier (closing marker)', () => {
    const input = [
      ':::',
      'plain text',
      '',
    ].join('\n');
    expect(normalizeMkautodocBlocks(input)).toBe(input);
  });

  it('leaves `:::` lines inside a fenced code block untouched', () => {
    // A code example showing mkautodoc syntax must stay inside its fence.
    const input = [
      '```text',
      '::: httpx.request',
      '    :docstring:',
      '```',
      '',
    ].join('\n');
    expect(normalizeMkautodocBlocks(input)).toBe(input);
  });

  it('handles a body with multiple indented lines and intervening blank lines', () => {
    const input = [
      '::: httpx.Client',
      '    :docstring:',
      '    :members:',
      '',
      '    :inherited-members:',
      '',
      'Done.',
      '',
    ].join('\n');
    const output = normalizeMkautodocBlocks(input);
    expect(output).toContain(':inherited-members:');
    // The block ends before "Done."
    const beforeDone = output.slice(0, output.indexOf('Done.'));
    expect(beforeDone.match(/```/g)?.length).toBe(2);
  });

  it('is idempotent — running it twice produces the same output as running it once', () => {
    const input = [
      '::: httpx.request',
      '    :docstring:',
      '',
      'After.',
      '',
    ].join('\n');
    const once = normalizeMkautodocBlocks(input);
    const twice = normalizeMkautodocBlocks(once);
    expect(twice).toBe(once);
  });

  it('wraps a bare `::: name` line with no following indented body in a fenced code block', () => {
    // mkdocstrings (pydantic regression): bare ::: lines with no indented body
    // were NOT being wrapped, causing remark-stringify to escape them to \:::
    // in the output. Any `::: identifier` line (with a space before the identifier)
    // must be wrapped, regardless of whether it has an options block.
    const input = [
      '::: httpx.request',
      'Not indented.',
      '',
    ].join('\n');
    const output = normalizeMkautodocBlocks(input);
    expect(output).toContain('```text');
    expect(output).toContain('::: httpx.request');
    expect(output).not.toMatch(/\\:::/);
  });
});
