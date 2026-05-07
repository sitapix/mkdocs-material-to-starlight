/**
 * Run an injected `OutputValidator` over a converted file's text and turn
 * the result into typed `Diagnostic`s. This is the bridge between the
 * domain port and the diagnostic stream the CLI/API surface to users.
 *
 * Pure orchestration — no I/O, no third-party-library knowledge. The
 * actual MDX/Markdown parsing happens in the injected adapter.
 *
 * Output mapping:
 *   ok                 → []
 *   failure            → one error per parser error, with line/column
 *                        when available
 *   driver-missing     → single info diagnostic with install hint
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { OutputValidator } from '../../domain/ports/output-validator.js';

const SOURCE = 'validate-output';

export async function validateOutput(
  text: string,
  extension: 'md' | 'mdx',
  validator: OutputValidator,
): Promise<ReadonlyArray<Diagnostic>> {
  const result = await validator.validate(text, extension);
  if (result.kind === 'ok') return [];

  if (result.kind === 'driver-missing') {
    return [
      createDiagnostic({
        severity: 'info',
        ruleId: 'output-validator-unavailable',
        source: SOURCE,
        message: `Output syntax validation skipped (@mdx-js/mdx not installed). ${result.hint}`,
      }),
    ];
  }

  return result.errors.map((e) => {
    const place =
      e.line !== null && e.column !== null ? { place: { line: e.line, column: e.column } } : {};
    return createDiagnostic({
      severity: 'error',
      ruleId: 'output-syntax-error',
      source: SOURCE,
      message: `${extension.toUpperCase()} parse error: ${e.message}`,
      ...place,
    });
  });
}
