import { describe, expect, it } from 'vitest';
import { isFenceLine } from './fence.js';

describe('isFenceLine', () => {
  it('matches a bare three-backtick fence opener', () => {
    expect(isFenceLine('```')).toBe(true);
  });

  it('matches a backtick fence with a language info string', () => {
    expect(isFenceLine('```bash')).toBe(true);
    expect(isFenceLine('```python title="x.py"')).toBe(true);
  });

  it('matches longer backtick fences (4+ backticks)', () => {
    expect(isFenceLine('````')).toBe(true);
    expect(isFenceLine('``````')).toBe(true);
  });

  it('matches tilde fences', () => {
    expect(isFenceLine('~~~')).toBe(true);
    expect(isFenceLine('~~~bash')).toBe(true);
  });

  it('matches with up to 3 spaces of indent', () => {
    expect(isFenceLine('   ```')).toBe(true);
    expect(isFenceLine('   ~~~bash')).toBe(true);
  });

  it('does NOT match four-or-more spaces of indent (that is an indented code block)', () => {
    expect(isFenceLine('    ```')).toBe(false);
  });

  it('does NOT match `​`​`info`​`​` inline code with backticks at both ends', () => {
    // Real pydantic-ai regression: this is CommonMark inline code with a
    // three-backtick delimiter, not a fenced block. The old regex matched
    // the leading backticks and silently toggled `inFence`, breaking every
    // subsequent normalizer pass.
    const sample = '```snippet {path="x"}```'.replace(/`​/g, '`');
    expect(isFenceLine(sample)).toBe(false);
  });

  it('does NOT match a line whose backticks are followed by other backticks', () => {
    expect(isFenceLine('```' + 'a' + '```')).toBe(false);
    expect(isFenceLine('``` ```')).toBe(false);
  });

  it('matches tilde fence even when info string contains backticks (per CommonMark §4.5)', () => {
    // Backtick fences ban backticks in info; tilde fences allow them.
    expect(isFenceLine('~~~text `notes`')).toBe(true);
  });

  it('does not match plain text', () => {
    expect(isFenceLine('hello')).toBe(false);
    expect(isFenceLine('!!! note')).toBe(false);
    expect(isFenceLine('')).toBe(false);
  });
});
