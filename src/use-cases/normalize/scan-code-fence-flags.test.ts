import { describe, expect, it } from 'vitest';
import { scanCodeFenceFlags } from './scan-code-fence-flags.js';

describe('scanCodeFenceFlags', () => {
  it('detects .copy flag on a fence', () => {
    const src = '```python { .python .copy }\nprint(1)\n```\n';
    const out = scanCodeFenceFlags(src);
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleId).toBe('code-fence-copy-flag-stripped');
    expect(out[0]?.message).toContain('.copy');
  });

  it('detects .no-copy flag on a fence', () => {
    const src = '```bash { .bash .no-copy }\necho hi\n```\n';
    const out = scanCodeFenceFlags(src);
    expect(out).toHaveLength(1);
    expect(out[0]?.message).toContain('.no-copy');
  });

  it('does not match plain fences without the flag', () => {
    const src = '```python\nprint(1)\n```\n';
    expect(scanCodeFenceFlags(src)).toHaveLength(0);
  });

  it('does not match fences with only line-range braces', () => {
    const src = '```python {1,3-5}\nprint(1)\n```\n';
    expect(scanCodeFenceFlags(src)).toHaveLength(0);
  });

  it('reports each occurrence separately with line numbers', () => {
    const src = [
      '```python { .copy }',
      'a',
      '```',
      '',
      '```js { .no-copy }',
      'b',
      '```',
    ].join('\n');
    const out = scanCodeFenceFlags(src);
    expect(out).toHaveLength(2);
    expect(out[0]?.place?.line).toBe(1);
    expect(out[1]?.place?.line).toBe(5);
  });

  it('returns empty array for source with no fences', () => {
    expect(scanCodeFenceFlags('Plain prose.\n')).toHaveLength(0);
  });
});
