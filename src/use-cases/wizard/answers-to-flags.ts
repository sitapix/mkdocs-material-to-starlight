/**
 * Convert WizardAnswers back to the equivalent CLI argv.
 *
 * Used in two places:
 *   1. The `--dry-run` plan output prints the equivalent command so the user
 *      can re-run unattended.
 *   2. Round-trip tests verify that parseArgs(answersToFlags(a)) → a.
 *
 * Only emits flags for non-default values to keep the output minimal.
 */

import type { WizardAnswers } from '../../domain/wizard/answers.js';

const DEFAULTS: Omit<WizardAnswers, 'projectDir' | 'outputDir'> = {
  packageManager: 'npm',
  check: true,
  tabs: 'mdx',
  sidebarTopics: true,
  rss: true,
  mikeVersions: [],
  palette: 'translate',
  extraAssets: [],
  locales: [],
  snippetBasePaths: [],
  snippetMaxDepth: 8,
  snippetDedentSubsections: false,
  linksValidator: true,
  expressiveCodeTheme: null,
  cards: 'html',
  mdxMode: 'auto',
  logoReplacesTitle: false,
  admonitionMapPath: null,
  keepExplicitHeadingIds: false,
  smartSymbols: true,
  emojiShortcodes: true,
  inlineMarks: true,
  autoAppend: true,
  suppressRules: [],
  configFormat: 'mjs',
  packageName: null,
};

export function answersToFlags(a: WizardAnswers): ReadonlyArray<string> {
  const out: string[] = [a.projectDir, a.outputDir];

  if (a.packageManager !== DEFAULTS.packageManager)
    out.push(`--package-manager=${a.packageManager}`);
  if (a.check !== DEFAULTS.check) out.push(a.check ? '--check' : '--no-check');
  if (a.tabs !== DEFAULTS.tabs) out.push(`--tabs=${a.tabs}`);
  if (a.sidebarTopics !== DEFAULTS.sidebarTopics)
    out.push(a.sidebarTopics ? '--sidebar-topics' : '--no-sidebar-topics');
  if (a.rss !== DEFAULTS.rss) out.push(a.rss ? '--rss' : '--no-rss');
  for (const v of a.mikeVersions) out.push(`--mike-versions=${v}`);
  if (a.palette !== DEFAULTS.palette) out.push(`--palette=${a.palette}`);
  for (const p of a.extraAssets) out.push(`--extra-asset=${p}`);
  for (const l of a.locales) out.push(`--locale=${l}`);
  for (const p of a.snippetBasePaths) {
    out.push('--snippet-base-path', p);
  }
  if (a.snippetMaxDepth !== DEFAULTS.snippetMaxDepth)
    out.push(`--snippet-max-depth=${String(a.snippetMaxDepth)}`);
  if (a.snippetDedentSubsections !== DEFAULTS.snippetDedentSubsections)
    out.push('--snippet-dedent-subsections');
  if (a.linksValidator !== DEFAULTS.linksValidator)
    out.push(a.linksValidator ? '--links-validator' : '--no-links-validator');
  if (a.expressiveCodeTheme !== null)
    out.push(`--expressive-code-theme=${a.expressiveCodeTheme}`);
  if (a.cards !== DEFAULTS.cards) out.push(`--cards=${a.cards}`);
  if (a.mdxMode !== DEFAULTS.mdxMode) out.push(`--mdx-mode=${a.mdxMode}`);
  if (a.logoReplacesTitle) out.push('--logo-replaces-title');
  if (a.admonitionMapPath !== null)
    out.push(`--admonition-map=${a.admonitionMapPath}`);
  if (a.keepExplicitHeadingIds) out.push('--keep-explicit-heading-ids');
  if (a.smartSymbols !== DEFAULTS.smartSymbols && !a.smartSymbols)
    out.push('--no-smart-symbols');
  if (a.emojiShortcodes !== DEFAULTS.emojiShortcodes && !a.emojiShortcodes)
    out.push('--no-emoji-shortcodes');
  if (a.inlineMarks !== DEFAULTS.inlineMarks && !a.inlineMarks)
    out.push('--no-inline-marks');
  if (a.autoAppend !== DEFAULTS.autoAppend && !a.autoAppend)
    out.push('--no-auto-append');
  for (const r of a.suppressRules) out.push(`--suppress=${r}`);
  if (a.configFormat !== DEFAULTS.configFormat)
    out.push(`--config-format=${a.configFormat}`);
  if (a.packageName !== null) out.push(`--package-name=${a.packageName}`);

  return out;
}
