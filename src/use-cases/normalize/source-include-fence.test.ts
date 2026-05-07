import { describe, expect, it } from 'vitest';
import { normalizeSourceIncludeFence } from './source-include-fence.js';

describe('normalizeSourceIncludeFence', () => {
  it('passes through text containing no `{* path *}` includes', () => {
    const input = 'Just a paragraph.\n\n## Heading\n\nMore text.\n';
    expect(normalizeSourceIncludeFence(input)).toBe(input);
  });

  it('wraps a `{* path *}` line in a fenced code block', () => {
    // Some sites use `{* ../../docs_src/foo.py *}` to inline source from a
    // separate Python file via a custom plugin. The converter cannot run
    // that plugin. Without normalization, remark-stringify escapes both
    // `{` and `*` to defensive forms (`{\* path \*}`), producing unreadable
    // output. Wrapping in a fenced code block preserves the marker verbatim
    // so the human reader can replace it manually.
    const input = '{* ../../docs_src/first_steps/tutorial001.py *}\n';
    const output = normalizeSourceIncludeFence(input);
    expect(output).toContain('```text');
    expect(output).toContain('{* ../../docs_src/first_steps/tutorial001.py *}');
    expect(output.match(/```/g)?.length).toBe(2);
  });

  it('wraps include lines that carry highlight markers like `hl[1]`', () => {
    const input = '{* ../../docs_src/first_steps/tutorial001.py hl[3] *}\n';
    const output = normalizeSourceIncludeFence(input);
    expect(output).toContain('hl[3]');
    expect(output.match(/```/g)?.length).toBe(2);
  });

  it('wraps each include independently when several appear in sequence', () => {
    const input = ['{* ../../docs_src/a.py *}', '', '{* ../../docs_src/b.py *}', ''].join('\n');
    const output = normalizeSourceIncludeFence(input);
    expect(output.match(/^```text$/gm)?.length).toBe(2);
    expect(output).toContain('a.py');
    expect(output).toContain('b.py');
  });

  it('does not touch `{*` patterns inside a fenced code block', () => {
    const input = '```text\n{* ../../docs_src/example.py *}\n```\n';
    expect(normalizeSourceIncludeFence(input)).toBe(input);
  });

  it('does not match inline `{*...*}` in the middle of a paragraph', () => {
    // The marker is a block-level construct — it stands alone on a line.
    // A `{* something *}` inside prose is something else and should be
    // left alone.
    const input = 'Here is a token {* inline *} in prose.\n';
    expect(normalizeSourceIncludeFence(input)).toBe(input);
  });

  it('is idempotent — wrapping is a no-op the second time', () => {
    const input = '{* ../../docs_src/foo.py *}\n';
    const once = normalizeSourceIncludeFence(input);
    const twice = normalizeSourceIncludeFence(once);
    expect(twice).toBe(once);
  });
});
