import { describe, expect, it } from 'vitest';
import { detectCustomAdmonitions } from './custom-admonitions.js';

describe('detectCustomAdmonitions', () => {
  it('detects a squashable Material type in any source', () => {
    expect(detectCustomAdmonitions(['# Plain page\n', '!!! abstract\n    Summary.\n'])).toBe(true);
  });

  it('detects collapsible forms (??? and ???+)', () => {
    expect(detectCustomAdmonitions(['??? question "FAQ"\n    Body.\n'])).toBe(true);
    expect(detectCustomAdmonitions(['???+ example\n    Body.\n'])).toBe(true);
  });

  it('detects indented (nested) admonitions', () => {
    expect(detectCustomAdmonitions(['    !!! bug\n        Body.\n'])).toBe(true);
  });

  it('ignores types the four Starlight asides express cleanly', () => {
    // note/tip/danger are native; warning is a clean rename; quote becomes
    // a blockquote — none justify installing starlight-markdown-blocks.
    expect(
      detectCustomAdmonitions([
        '!!! note\n    A.\n',
        '!!! warning\n    B.\n',
        '!!! quote\n    C.\n',
      ]),
    ).toBe(false);
  });

  it('does not fire on prose mentioning a type name', () => {
    expect(detectCustomAdmonitions(['An abstract discussion of bug reports.\n'])).toBe(false);
  });

  it('returns false for an empty corpus', () => {
    expect(detectCustomAdmonitions([])).toBe(false);
  });
});
