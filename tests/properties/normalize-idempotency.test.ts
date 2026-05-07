import { describe, expect, it } from 'vitest';
import { normalizeAdmonitions } from '../../src/use-cases/normalize/admonitions.js';

/**
 * Idempotency property — running the normalizer twice produces the same
 * output as running it once. This is the master invariant for the
 * pre-parse stage; if it fails, the stage has order-coupling that will
 * resurface as flaky downstream behaviour.
 *
 * The fixture corpus deliberately covers admonition shapes, fenced-code
 * shielding, mixed content, and already-normalized inputs.
 */

const CORPUS: ReadonlyArray<{ name: string; source: string }> = [
  { name: 'empty', source: '' },
  { name: 'plain markdown', source: '# Title\n\nA paragraph.\n' },
  {
    name: 'simple admonition',
    source: '!!! note\n    Body line.\n',
  },
  {
    name: 'titled admonition',
    source: '!!! warning "Heads up"\n    Read this carefully.\n',
  },
  {
    name: 'collapsible closed',
    source: '??? tip\n    Hidden by default.\n',
  },
  {
    name: 'collapsible open',
    source: '???+ tip\n    Visible by default.\n',
  },
  {
    name: 'inline end',
    source: '!!! info inline end "Aside"\n    Floats right.\n',
  },
  {
    name: 'two admonitions back to back',
    source: '!!! note\n    First.\n\n!!! warning\n    Second.\n',
  },
  {
    name: 'admonition then paragraph',
    source: '!!! note\n    Body.\n\nFollowing paragraph.\n',
  },
  {
    name: 'fenced code containing admonition-looking lines',
    source: '```\n!!! note\n    body\n```\n',
  },
  {
    name: 'mixed content with code and admonition',
    source: 'Intro.\n\n```python\nprint("hi")\n```\n\n!!! tip "Use uv"\n    It is fast.\n',
  },
  {
    name: 'already normalized output passes through unchanged',
    source: ':::note\nBody.\n:::\n',
  },
];

describe('normalizeAdmonitions idempotency property', () => {
  for (const fixture of CORPUS) {
    it(`is idempotent for: ${fixture.name}`, () => {
      const once = normalizeAdmonitions(fixture.source);
      const twice = normalizeAdmonitions(once);
      expect(twice).toBe(once);
    });
  }

  it('preserves already-normalized inputs verbatim', () => {
    const normalized = ':::note[Title]\nBody.\n:::\n';
    expect(normalizeAdmonitions(normalized)).toBe(normalized);
  });
});
