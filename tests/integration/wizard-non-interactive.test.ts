import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/interface/cli/main.js';

describe('non-interactive without --yes', () => {
  it('exits 2 when CI is set and no --yes provided in zero-arg invocation', async () => {
    const oldCi = process.env.CI;
    process.env.CI = '1';
    try {
      const lines: string[] = [];
      const err: string[] = [];
      const exit = await runCli([], {
        stdout: (l) => lines.push(l),
        stderr: (l) => err.push(l),
      });
      expect(exit).toBe(2);
      expect(err.join('\n')).toMatch(/--yes/i);
    } finally {
      if (oldCi === undefined) delete process.env.CI;
      else process.env.CI = oldCi;
    }
  });
});
