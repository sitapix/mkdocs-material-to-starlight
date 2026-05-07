/**
 * Compute DefaultAnswers from a parsed mkdocs config + the runtime env.
 *
 * Pure: no I/O, no `process.*` access. The caller passes `process.env` and
 * `process.env.npm_config_user_agent` explicitly so this function is trivially
 * testable.
 *
 * The defaults intentionally reproduce the converter's *current* behavior
 * (links validator on, palette translate, tabs MDX-when-detected, etc.) so
 * `--yes` on a fresh install equals "what we shipped before this wizard."
 */

import { join } from 'node:path';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import type { DefaultAnswers, PackageManager } from '../../domain/wizard/answers.js';

export interface DeriveDefaultsContext {
  readonly userAgent: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export function deriveDefaults(_config: MkdocsConfig, ctx: DeriveDefaultsContext): DefaultAnswers {
  return {
    packageManager: guessPackageManager(ctx.userAgent),
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
}

export function guessPackageManager(userAgent: string | undefined): PackageManager {
  if (userAgent === undefined) return 'npm';
  if (userAgent.startsWith('pnpm/')) return 'pnpm';
  if (userAgent.startsWith('yarn/')) return 'yarn';
  if (userAgent.startsWith('bun/')) return 'bun';
  return 'npm';
}

/**
 * Default output directory for the wizard's first prompt: a `starlight`
 * folder right next to wherever the user ran the CLI.
 *
 * Pure: takes the cwd as a parameter so the function is trivially testable.
 * The interface layer (`wizard-runner.ts`) owns reading `process.cwd()`.
 *
 * The result is intentionally absolute (when the cwd is absolute) so the
 * prompt shows the user the full destination — no surprise about where
 * `./starlight` resolves relative to.
 */
export function deriveOutputDirName(cwd: string): string {
  return join(cwd, 'starlight');
}
