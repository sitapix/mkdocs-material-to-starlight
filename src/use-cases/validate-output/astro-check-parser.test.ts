import { describe, expect, it } from 'vitest';
import type { ProcessOutput } from '../../domain/ports/process-runner.js';
import { parseAstroCheckOutput } from './astro-check-parser.js';

function output(partial: Partial<ProcessOutput>): ProcessOutput {
  return {
    exitCode: partial.exitCode ?? 0,
    stdout: partial.stdout ?? '',
    stderr: partial.stderr ?? '',
    timedOut: partial.timedOut ?? false,
  };
}

describe('parseAstroCheckOutput', () => {
  it('returns no diagnostics for a clean run (exit 0, no errors reported)', () => {
    const out = output({
      exitCode: 0,
      stdout: '00:00:01 [check] Result (5 files): 0 errors, 0 warnings, 0 hints.\n',
    });
    expect(parseAstroCheckOutput(out)).toEqual([]);
  });

  it('parses a single Error line with file:line:column - Error: message form', () => {
    const out = output({
      exitCode: 1,
      stdout: 'src/content/docs/index.md:3:1 - Error: Missing field "title".\n',
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('astro-check-error');
    expect(diags[0]?.severity).toBe('error');
    expect(diags[0]?.message).toContain('Missing field "title"');
    expect(diags[0]?.message).toContain('src/content/docs/index.md');
    expect(diags[0]?.place?.line).toBe(3);
    expect(diags[0]?.place?.column).toBe(1);
  });

  it('parses warnings as astro-check-warning with severity warning', () => {
    const out = output({
      exitCode: 0,
      stdout: "src/pages/about.astro:5:10 - Warning: 'foo' is declared but never used.\n",
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('astro-check-warning');
    expect(diags[0]?.severity).toBe('warning');
  });

  it('parses hints as astro-check-hint with severity info', () => {
    const out = output({
      exitCode: 0,
      stdout: 'src/pages/foo.astro:1:1 - Hint: prefer named export.\n',
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('astro-check-hint');
    expect(diags[0]?.severity).toBe('info');
  });

  it('parses a mix of severities preserving order', () => {
    const out = output({
      exitCode: 1,
      stdout: [
        'src/a.md:1:1 - Error: bad',
        'src/b.md:2:2 - Warning: meh',
        'src/c.md:3:3 - Hint: fyi',
        '',
      ].join('\n'),
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags.map((d) => d.ruleId)).toEqual([
      'astro-check-error',
      'astro-check-warning',
      'astro-check-hint',
    ]);
  });

  it('parses two-line modern form (path:line:col then indented Error: message)', () => {
    const out = output({
      exitCode: 1,
      stdout: ['src/content/docs/api.mdx:7:3', '  Error: Cannot find name `Tabs`.', ''].join('\n'),
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('astro-check-error');
    expect(diags[0]?.message).toContain('Cannot find name `Tabs`');
    expect(diags[0]?.place?.line).toBe(7);
    expect(diags[0]?.place?.column).toBe(3);
  });

  it('strips ANSI escape codes from messages', () => {
    const out = output({
      exitCode: 1,
      stdout: 'src/x.md:1:1 - \u001b[31mError\u001b[0m: bad thing happened\n',
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).not.toContain('\u001b');
    expect(diags[0]?.message).toContain('bad thing happened');
  });

  it('reads diagnostics from stderr as well as stdout', () => {
    const out = output({
      exitCode: 1,
      stderr: 'src/y.md:2:1 - Error: stderr-side problem\n',
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('stderr-side problem');
  });

  it('emits astro-check-unparsed-output when exit is non-zero but nothing parses', () => {
    const out = output({
      exitCode: 1,
      stdout: 'this is some unrecognized failure spew with no file:line:col\n',
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('astro-check-unparsed-output');
    // Exit non-zero means astro check itself signaled failure; not being able
    // to parse it doesn't downgrade that — the user's `--check` request did
    // not pass, so this surfaces as error (exit 1).
    expect(diags[0]?.severity).toBe('error');
    expect(diags[0]?.message).toContain('unrecognized failure spew');
  });

  it('ignores summary lines like "Result (N files): X errors"', () => {
    const out = output({
      exitCode: 1,
      stdout: [
        'src/a.md:1:1 - Error: bad',
        '00:00:02 [check] Result (3 files): 1 error, 0 warnings, 0 hints.',
        '',
      ].join('\n'),
    });
    const diags = parseAstroCheckOutput(out);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('astro-check-error');
  });

  it('returns immutable diagnostics (does not mutate inputs)', () => {
    const out = output({
      exitCode: 1,
      stdout: 'src/a.md:1:1 - Error: x',
    });
    const stdoutBefore = out.stdout;
    parseAstroCheckOutput(out);
    expect(out.stdout).toBe(stdoutBefore);
  });

  it('idempotency: parsing the same output twice returns identical diagnostics', () => {
    const out = output({
      exitCode: 1,
      stdout: ['src/a.md:1:1 - Error: a', 'src/b.md:2:2 - Warning: b', ''].join('\n'),
    });
    expect(parseAstroCheckOutput(out)).toEqual(parseAstroCheckOutput(out));
  });
});
