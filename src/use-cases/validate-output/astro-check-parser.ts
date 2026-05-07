/**
 * Pure parser for `astro check` output. Takes a captured `ProcessOutput` from
 * the ProcessRunner port and translates it into typed `Diagnostic`s.
 *
 * The parser tolerates two output forms emitted by current Astro versions:
 *
 *   1. Single-line: `path:line:col - Severity: message`
 *   2. Two-line:    `path:line:col` followed by an indented `Severity: message`
 *
 * Severity tokens are `Error`, `Warning`, and `Hint`. ANSI color escapes are
 * stripped before matching so coloured terminal output parses cleanly.
 *
 * Failure modes are surfaced as their own diagnostics (`astro-check-timeout`,
 * `astro-check-unparsed-output`); the caller never sees a thrown exception.
 */

import type { Diagnostic, Severity } from '../../domain/diagnostics/diagnostic.js';
import type { ProcessOutput } from '../../domain/ports/process-runner.js';

const ANSI_RE = /\u001b\[[0-9;]*m/g;
const SINGLE_LINE_RE =
  /^(?<path>\S+):(?<line>\d+):(?<column>\d+)\s*-\s*(?<severity>Error|Warning|Hint):\s*(?<message>.+)$/;
const PATH_LINE_RE = /^(?<path>\S+\.\w+):(?<line>\d+):(?<column>\d+)\s*$/;
const INDENTED_MESSAGE_RE = /^\s+(?<severity>Error|Warning|Hint):\s*(?<message>.+)$/;

const SEVERITY_TO_RULE: Readonly<Record<string, { ruleId: string; severity: Severity }>> = {
  Error: { ruleId: 'astro-check-error', severity: 'error' },
  Warning: { ruleId: 'astro-check-warning', severity: 'warning' },
  Hint: { ruleId: 'astro-check-hint', severity: 'info' },
};

const SOURCE = 'validate-output/astro-check';

export function parseAstroCheckOutput(output: ProcessOutput): ReadonlyArray<Diagnostic> {
  if (output.timedOut) {
    return [
      {
        ruleId: 'astro-check-timeout',
        severity: 'error',
        message: '`astro check` exceeded the configured timeout and was killed.',
        source: SOURCE,
      },
    ];
  }

  const combined = stripAnsi(`${output.stdout}\n${output.stderr}`);
  const lines = combined.split('\n');
  const diagnostics: Diagnostic[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const single = matchSingleLine(lines[i] ?? '');
    if (single !== null) {
      diagnostics.push(single);
      continue;
    }
    const twoLine = matchTwoLine(lines[i] ?? '', lines[i + 1] ?? '');
    if (twoLine !== null) {
      diagnostics.push(twoLine);
      i += 1;
    }
  }

  if (diagnostics.length === 0 && output.exitCode !== 0 && output.exitCode !== null) {
    return [unparsedOutputDiagnostic(combined)];
  }

  return diagnostics;
}

function matchSingleLine(line: string): Diagnostic | null {
  const match = line.match(SINGLE_LINE_RE);
  if (match === null || match.groups === undefined) return null;
  return buildDiagnostic({
    path: match.groups.path ?? '',
    line: Number(match.groups.line),
    column: Number(match.groups.column),
    severity: match.groups.severity ?? '',
    message: (match.groups.message ?? '').trim(),
  });
}

function matchTwoLine(first: string, second: string): Diagnostic | null {
  const head = first.match(PATH_LINE_RE);
  if (head === null || head.groups === undefined) return null;
  const tail = second.match(INDENTED_MESSAGE_RE);
  if (tail === null || tail.groups === undefined) return null;
  return buildDiagnostic({
    path: head.groups.path ?? '',
    line: Number(head.groups.line),
    column: Number(head.groups.column),
    severity: tail.groups.severity ?? '',
    message: (tail.groups.message ?? '').trim(),
  });
}

interface ParsedFields {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly severity: string;
  readonly message: string;
}

function buildDiagnostic(fields: ParsedFields): Diagnostic | null {
  const mapped = SEVERITY_TO_RULE[fields.severity];
  if (mapped === undefined) return null;
  return {
    ruleId: mapped.ruleId,
    severity: mapped.severity,
    message: `${fields.path}: ${fields.message}`,
    source: SOURCE,
    place: { line: fields.line, column: fields.column },
  };
}

function unparsedOutputDiagnostic(combined: string): Diagnostic {
  const trimmed = combined.trim().slice(0, 500);
  return {
    ruleId: 'astro-check-unparsed-output',
    severity: 'warning',
    message: `astro check exited non-zero but no individual diagnostics could be parsed. Raw output: ${trimmed}`,
    source: SOURCE,
  };
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}
