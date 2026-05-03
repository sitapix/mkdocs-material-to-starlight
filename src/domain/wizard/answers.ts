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

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type TabsStrategy = 'mdx' | 'html';
export type PaletteStrategy = 'translate' | 'skip' | 'custom';
export type CardsStrategy = 'mdx' | 'html' | 'skip';
export type MdxMode = 'auto' | 'always' | 'never';
export type ConfigFormat = 'mjs' | 'ts';

export interface WizardAnswers {
  // Tier 0 (positional/required)
  readonly projectDir: string;
  readonly outputDir: string;
  // Tier 0 (always asked)
  readonly packageManager: PackageManager;
  readonly check: boolean;
  // Tier 1 (conditional on detected features)
  readonly tabs: TabsStrategy;
  readonly sidebarTopics: boolean;
  readonly rss: boolean;
  readonly mikeVersions: ReadonlyArray<string>;
  readonly palette: PaletteStrategy;
  readonly extraAssets: ReadonlyArray<string>;
  readonly locales: ReadonlyArray<string>;
  readonly snippetBasePaths: ReadonlyArray<string>;
  readonly snippetMaxDepth: number;
  readonly snippetDedentSubsections: boolean;
  // Tier 2 (advanced)
  readonly linksValidator: boolean;
  readonly expressiveCodeTheme: string | null;
  readonly cards: CardsStrategy;
  readonly mdxMode: MdxMode;
  readonly logoReplacesTitle: boolean;
  readonly admonitionMapPath: string | null;
  readonly keepExplicitHeadingIds: boolean;
  readonly smartSymbols: boolean;
  readonly emojiShortcodes: boolean;
  readonly inlineMarks: boolean;
  readonly autoAppend: boolean;
  readonly suppressRules: ReadonlyArray<string>;
  readonly configFormat: ConfigFormat;
  readonly packageName: string | null;
}

export type DefaultAnswers = Omit<WizardAnswers, 'projectDir' | 'outputDir'>;

export interface WizardCancelled {
  readonly tag: 'wizard-cancelled';
}
export const WIZARD_CANCELLED: WizardCancelled = { tag: 'wizard-cancelled' };
