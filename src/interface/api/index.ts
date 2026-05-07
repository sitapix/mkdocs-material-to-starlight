// Public API surface for the programmatic entry point.

export type { Diagnostic, Severity } from '../../domain/diagnostics/diagnostic.js';
export type { Result } from '../../domain/result.js';
export type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';
export {
  type ConvertSiteFromDiskError,
  type ConvertSiteFromDiskInput,
  type ConvertSiteFromDiskOutput,
  convertSiteFromDisk,
} from './convert-site.js';
