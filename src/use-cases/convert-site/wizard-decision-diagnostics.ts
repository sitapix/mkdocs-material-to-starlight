/**
 * Build informational `wizard-decision-applied` diagnostics for wizard / CLI
 * options that are accepted by the API but whose behavior change is deferred
 * to a future release. Surfacing these decisions tells the user "you asked
 * for X but X isn't wired up yet" instead of silently ignoring the flag.
 *
 * Pure: takes a structural subset of `ConvertSiteFromDiskInput`, returns
 * tagged diagnostics. No I/O. The narrow input type means callers don't
 * have to drag the full API input shape across module boundaries.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface DeferredWizardDecisions {
  readonly cards?: 'mdx' | 'html' | 'skip';
  readonly mdxMode?: 'auto' | 'always' | 'never';
  readonly keepExplicitHeadingIds?: boolean;
  readonly noSmartSymbols?: boolean;
  readonly noEmojiShortcodes?: boolean;
  readonly noInlineMarks?: boolean;
  readonly noAutoAppend?: boolean;
  readonly snippetMaxDepth?: number;
  readonly snippetDedentSubsections?: boolean;
  readonly expressiveCodeTheme?: string;
  readonly admonitionMapPath?: string;
  readonly extraAssets?: ReadonlyArray<string>;
  readonly locales?: ReadonlyArray<string>;
  readonly suppressRules?: ReadonlyArray<string>;
  readonly sidebarTopics?: boolean;
}

export interface DeferredDecisionDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export function buildDeferredWizardDiagnostics(
  input: DeferredWizardDecisions,
): ReadonlyArray<DeferredDecisionDiagnostic> {
  const out: DeferredDecisionDiagnostic[] = [];
  const add = (message: string): void => {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'wizard-decision-applied',
        source: SOURCE,
        message,
      }),
    });
  };

  if (input.cards !== undefined) {
    add(
      `Configured: --cards=${input.cards} requested. The MDX <Card>/<CardGrid> output path is not yet implemented in this build; falling back to HTML + shim. (Tracked for v2.)`,
    );
  }
  if (input.mdxMode !== undefined) {
    add(
      `Configured: --mdx-mode=${input.mdxMode} requested. MDX mode selection is not yet implemented in this build; using auto-detection. (Tracked for v2.)`,
    );
  }
  if (input.keepExplicitHeadingIds === true) {
    add(
      `Configured: --keep-explicit-heading-ids requested. Explicit heading ID preservation is not yet implemented in this build; IDs may be re-generated. (Tracked for v2.)`,
    );
  }
  if (input.noSmartSymbols === true) {
    add(
      `Configured: --no-smart-symbols requested. Smart-symbol suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.noEmojiShortcodes === true) {
    add(
      `Configured: --no-emoji-shortcodes requested. Emoji shortcode suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.noInlineMarks === true) {
    add(
      `Configured: --no-inline-marks requested. Inline marks suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.noAutoAppend === true) {
    add(
      `Configured: --no-auto-append requested. Auto-append suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.snippetMaxDepth !== undefined) {
    add(
      `Configured: --snippet-max-depth=${String(input.snippetMaxDepth)} requested. Snippet depth limiting is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.snippetDedentSubsections === true) {
    add(
      `Configured: --snippet-dedent-subsections requested. Snippet subsection dedenting is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.expressiveCodeTheme !== undefined) {
    add(
      `Configured: --expressive-code-theme=${input.expressiveCodeTheme} requested. ExpressiveCode theme override is not yet implemented in this build; using auto-detected theme. (Tracked for v2.)`,
    );
  }
  if (input.admonitionMapPath !== undefined) {
    add(
      `Configured: --admonition-map=${input.admonitionMapPath} requested. Custom admonition mapping is not yet implemented in this build; using built-in map. (Tracked for v2.)`,
    );
  }
  if (input.extraAssets !== undefined && input.extraAssets.length > 0) {
    add(
      `Configured: --extra-asset paths requested (${String(input.extraAssets.length)} items). Extra asset inclusion is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.locales !== undefined && input.locales.length > 0) {
    add(
      `Configured: --locale codes requested (${input.locales.join(', ')}). Locale override is not yet implemented in this build; using auto-detected i18n config. (Tracked for v2.)`,
    );
  }
  if (input.suppressRules !== undefined && input.suppressRules.length > 0) {
    add(
      `Configured: --suppress rules requested (${input.suppressRules.join(', ')}). Rule suppression is not yet implemented in this build; all diagnostics are emitted. (Tracked for v2.)`,
    );
  }
  if (input.sidebarTopics === false) {
    add(
      `Configured: sidebarTopics: false requested. The starlight-sidebar-topics auto-install path is not implemented in this build; sidebar remains flat. (Tracked for v2.)`,
    );
  }
  return out;
}
