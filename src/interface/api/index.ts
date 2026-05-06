// Public API surface for the programmatic entry point.

export {
  convertSiteFromDisk,
  type ConvertSiteFromDiskInput,
  type ConvertSiteFromDiskOutput,
  type ConvertSiteFromDiskError,
} from './convert-site.js';

export type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';
export type { Diagnostic, Severity } from '../../domain/diagnostics/diagnostic.js';
export type { Result } from '../../domain/result.js';
