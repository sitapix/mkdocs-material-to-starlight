/**
 * Typed diagnostic — the only error channel in the converter.
 *
 * Transformations attach diagnostics to the per-file vfile. They never throw
 * for transformation failures. Severity "error" is reserved for conditions
 * that should fail the run (parse failure, unreadable file); "warning" and
 * "info" are non-fatal and decorate the migration report.
 *
 * The shape mirrors the unified ecosystem's vfile-message API so adapter
 * code in infrastructure can convert between the two without information loss.
 */

export type Severity = 'info' | 'warning' | 'error';

interface SourcePlace {
  readonly line: number;
  readonly column: number;
}

export interface Diagnostic {
  readonly severity: Severity;
  readonly ruleId: string;
  readonly message: string;
  readonly source: string;
  readonly place?: SourcePlace;
}

export interface DiagnosticInput {
  readonly severity: Severity;
  readonly ruleId: string;
  readonly message: string;
  readonly source: string;
  readonly place?: SourcePlace;
}

export function createDiagnostic(input: DiagnosticInput): Diagnostic {
  if (input.ruleId.length === 0) {
    throw new Error('Diagnostic.ruleId must be non-empty');
  }
  if (input.message.length === 0) {
    throw new Error('Diagnostic.message must be non-empty');
  }
  return input.place === undefined
    ? {
        severity: input.severity,
        ruleId: input.ruleId,
        message: input.message,
        source: input.source,
      }
    : {
        severity: input.severity,
        ruleId: input.ruleId,
        message: input.message,
        source: input.source,
        place: input.place,
      };
}

export function isFatal(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === 'error';
}
