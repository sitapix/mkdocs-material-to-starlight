/**
 * Wizard answers: the typed result of running the interactive prompts
 * (or, equivalently, the parsed combination of CLI flags).
 *
 * `WizardAnswers` is the union of every decision the converter exposes.
 * `DefaultAnswers` is the same shape minus the two positional inputs
 * (project + output dir) — it represents what the wizard *pre-fills* before
 * the user touches anything.
 *
 * `WIZARD_CANCELLED` is the typed cancellation sentinel returned via the
 * `Result<…, WizardCancelled>` channel from the orchestrator. The interface
 * layer is the only consumer that observes it and translates to exit 130.
 */

import type { PaletteStrategy } from '../starlight/palette-mapping.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
type TabsStrategy = 'mdx' | 'html';
type CardsStrategy = 'mdx' | 'html' | 'skip';
type MdxMode = 'auto' | 'always' | 'never';
type ConfigFormat = 'mjs' | 'ts';

export interface WizardAnswers {
  // Tier 0 — positional/required (always asked).
  readonly projectDir: string;
  readonly outputDir: string;
  // Tier 0 — always asked.
  readonly packageManager: PackageManager;
  readonly check: boolean;
  // Tier 1 — asked when the related feature is detected in mkdocs.yml.
  readonly tabs: TabsStrategy;
  readonly sidebarTopics: boolean;
  readonly rss: boolean;
  readonly mikeVersions: ReadonlyArray<string>;
  readonly palette: PaletteStrategy;
  readonly extraAssets: ReadonlyArray<string>;
  readonly locales: ReadonlyArray<string>;
  readonly snippetBasePaths: ReadonlyArray<string>;
  // Tier 2 — asked when the user opts into "advanced options" at the gate.
  readonly linksValidator: boolean;
  readonly cards: CardsStrategy;
  readonly mdxMode: MdxMode;
  readonly configFormat: ConfigFormat;
  // CLI-flag-only — NOT prompted by the wizard. Defaults come from
  // `deriveDefaults`; reach via flags (`--snippet-max-depth`, etc.) or
  // a direct programmatic call. Listed here because the converter accepts
  // them in the same answers shape; the wizard simply doesn't surface UI
  // for them to keep the prompt count manageable.
  readonly snippetMaxDepth: number;
  readonly snippetDedentSubsections: boolean;
  readonly expressiveCodeTheme: string | null;
  readonly logoReplacesTitle: boolean;
  readonly admonitionMapPath: string | null;
  readonly keepExplicitHeadingIds: boolean;
  readonly smartSymbols: boolean;
  readonly emojiShortcodes: boolean;
  readonly inlineMarks: boolean;
  readonly autoAppend: boolean;
  readonly suppressRules: ReadonlyArray<string>;
  readonly packageName: string | null;
}

export type DefaultAnswers = Omit<WizardAnswers, 'projectDir' | 'outputDir'>;

export interface WizardCancelled {
  readonly tag: 'wizard-cancelled';
}
export const WIZARD_CANCELLED: WizardCancelled = { tag: 'wizard-cancelled' };
