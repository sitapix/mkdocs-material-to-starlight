import { describe, expect, it } from 'vitest';
import { normalizeCodeBlockMeta } from './code-block-meta.js';

describe('normalizeCodeBlockMeta', () => {
  it('returns source unchanged when no fenced blocks present', () => {
    expect(normalizeCodeBlockMeta('Just text\n')).toBe('Just text\n');
  });

  it('translates linenums="N" to showLineNumbers + startLineNumber', () => {
    const out = normalizeCodeBlockMeta(
      '```python linenums="3"\nx = 1\n```\n',
    );
    expect(out).toContain('```python showLineNumbers startLineNumber=3');
  });

  it('translates hl_lines="2 4-6" to {2,4-6}', () => {
    const out = normalizeCodeBlockMeta(
      '```python hl_lines="2 4-6"\nx = 1\ny = 2\n```\n',
    );
    expect(out).toContain('{2,4-6}');
  });

  it('preserves title= attribute as-is', () => {
    const out = normalizeCodeBlockMeta(
      '```python title="example.py"\nx = 1\n```\n',
    );
    expect(out).toContain('title="example.py"');
  });

  it('combines linenums + hl_lines + title in one fence', () => {
    const out = normalizeCodeBlockMeta(
      '```python title="x.py" linenums="1" hl_lines="2"\nx=1\ny=2\n```\n',
    );
    expect(out).toContain('showLineNumbers');
    expect(out).toContain('{2}');
    expect(out).toContain('title="x.py"');
  });

  it('drops attr-list `{ .python .copy }` form into Expressive Code metadata', () => {
    const out = normalizeCodeBlockMeta(
      '```python { .python .copy }\nx = 1\n```\n',
    );
    // The .python class should resolve to language; .copy is implicit in EC.
    expect(out).toContain('```python');
  });

  it('idempotent: applying twice yields the same result', () => {
    const src = '```python linenums="2" hl_lines="3"\nx=1\n```\n';
    const first = normalizeCodeBlockMeta(src);
    const second = normalizeCodeBlockMeta(first);
    expect(second).toBe(first);
  });

  it('does not modify code blocks without Material-form attrs', () => {
    expect(normalizeCodeBlockMeta('```ts\nfoo()\n```\n')).toBe(
      '```ts\nfoo()\n```\n',
    );
  });

  it('handles single-number hl_lines', () => {
    const out = normalizeCodeBlockMeta(
      '```\ntext\n```\n```ts hl_lines="3"\nfoo\n```\n',
    );
    expect(out).toContain('{3}');
  });

  it('handles hl_lines option with no language token (typer regression)', () => {
    // ``` hl_lines="3 4" with NO language token must not treat hl_lines
    // as the language identifier.
    const out = normalizeCodeBlockMeta('``` hl_lines="3 4"\ncode\n```\n');
    expect(out).not.toContain('```hl_lines');
    expect(out).toContain('{3,4}');
  });

  describe('extracts title= from inside Material attr-list braces (Tier 3 #12)', () => {
    it('lifts title="..." out of `{ ... title="..." ... }` so Expressive Code renders the chrome', () => {
      // pydantic regression: `​```python {upgrade="skip" title="Validation Successful"}`
      // currently has its entire {...} block stripped, losing the title. Expressive
      // Code accepts `title="..."` only OUTSIDE the brace block.
      const out = normalizeCodeBlockMeta(
        '```python {upgrade="skip" title="Validation Successful"}\nx = 1\n```\n',
      );
      expect(out).toContain('title="Validation Successful"');
      // Title should be on the fence line, not inside braces
      const fenceLine = out.split('\n')[0] ?? '';
      expect(fenceLine).toMatch(/title="Validation Successful"/);
      expect(fenceLine).not.toMatch(/\{[^}]*title=/);
    });

    it('lifts title with single-quote variant', () => {
      const out = normalizeCodeBlockMeta(
        "```python {title='example.py'}\nx = 1\n```\n",
      );
      expect(out).toMatch(/title=("example\.py"|'example\.py')/);
    });

    it('drops other Material-only attributes from the brace block while keeping title', () => {
      const out = normalizeCodeBlockMeta(
        '```python {test="skip" lint="skip" title="Validation Error" upgrade="skip"}\nx=1\n```\n',
      );
      const fenceLine = out.split('\n')[0] ?? '';
      expect(fenceLine).toContain('title="Validation Error"');
      expect(fenceLine).not.toContain('test="skip"');
      expect(fenceLine).not.toContain('lint="skip"');
      expect(fenceLine).not.toContain('upgrade="skip"');
    });

    it('preserves brace block when no title is present (current behavior — strips Material-only attrs)', () => {
      const out = normalizeCodeBlockMeta(
        '```python {upgrade="skip"}\nx = 1\n```\n',
      );
      const fenceLine = out.split('\n')[0] ?? '';
      // No title to lift; Material-only attrs are dropped just like before.
      expect(fenceLine).not.toContain('upgrade');
    });

    it('idempotent: applying twice keeps the lifted title in place', () => {
      const src = '```python {upgrade="skip" title="X"}\ncode\n```\n';
      const first = normalizeCodeBlockMeta(src);
      const second = normalizeCodeBlockMeta(first);
      expect(second).toBe(first);
    });
  });
});
