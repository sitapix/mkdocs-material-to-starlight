/**
 * Build diagnostics describing how `extra.analytics` was applied to
 * Starlight's head[] entries, plus a warning when the dropped
 * `analytics.feedback` widget has no equivalent. Pure.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export interface AnalyticsResult {
  readonly provider: string;
  readonly property: string;
  readonly unsupported: ReadonlyArray<string>;
}

export function diagnoseAnalytics(
  analytics: AnalyticsResult | null,
): ReadonlyArray<TaggedDiagnostic> {
  if (analytics === null) return [];
  const out: TaggedDiagnostic[] = [
    {
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'extra-analytics-applied',
        source: SOURCE,
        message: `extra.analytics provider "${analytics.provider}" property "${analytics.property}" injected into starlight head[].`,
      }),
    },
  ];
  if (analytics.unsupported.includes('feedback')) {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'extra-analytics-feedback-dropped',
        source: SOURCE,
        message:
          'extra.analytics.feedback widget has no Starlight equivalent — reimplement via a custom component or install a community plugin.',
      }),
    });
  }
  return out;
}
