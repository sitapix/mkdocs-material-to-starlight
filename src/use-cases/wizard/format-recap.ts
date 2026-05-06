/**
 * Format the wizard's pre-convert recap. Pure function: takes the answers
 * gathered so far and renders a multi-line summary the orchestrator hands to
 * `prompter.note(...)` immediately before the convert/advanced gate.
 *
 * Why a recap at all: the wizard can run a dozen prompts. The standard
 * CLI-init pattern (`npm init`, `cargo init`, `tauri create`) recaps the
 * decisions before the final commit so the user can scan and back out before
 * the destructive step. We do the same here.
 *
 * Scope rule: every line must correspond to a decision the user was asked
 * about. Lines for un-prompted Tier 1 fields are omitted — they'd be noise
 * because the user never saw the question.
 */

import type { WizardAnswers } from '../../domain/wizard/answers.js';
import type { Tier0Answers } from './run-tier0.js';

export interface RecapInput {
  readonly projectDir: string;
  readonly tier0: Tier0Answers;
  /** Only the Tier 1 fields the user was actually prompted for. */
  readonly tier1: Partial<WizardAnswers>;
}

export function formatRecap(input: RecapInput): string {
  const lines: string[] = [];
  lines.push(`from: ${input.projectDir}`);
  lines.push(`to:   ${input.tier0.outputDir}`);
  lines.push(`package manager: ${input.tier0.packageManager}`);
  if (input.tier0.check) {
    lines.push('post-convert: astro check');
  }

  if (input.tier1.tabs !== undefined) {
    lines.push(`tabs: ${input.tier1.tabs}`);
  }
  if (input.tier1.sidebarTopics === true) {
    lines.push('sidebar: split by top-level group (starlight-sidebar-topics)');
  }
  if (input.tier1.rss === true) {
    lines.push('rss: src/pages/rss.xml.ts');
  }
  if (input.tier1.palette !== undefined) {
    lines.push(`palette: ${input.tier1.palette}`);
  }
  if (input.tier1.mikeVersions !== undefined && input.tier1.mikeVersions.length > 0) {
    lines.push(`mike versions: ${input.tier1.mikeVersions.join(', ')}`);
  }
  if (input.tier1.locales !== undefined && input.tier1.locales.length > 0) {
    lines.push(`${String(input.tier1.locales.length)} locales selected`);
  }
  if (input.tier1.extraAssets !== undefined && input.tier1.extraAssets.length > 0) {
    lines.push(
      `${String(input.tier1.extraAssets.length)} extra asset${input.tier1.extraAssets.length === 1 ? '' : 's'} carried over`,
    );
  }
  if (input.tier1.snippetBasePaths !== undefined && input.tier1.snippetBasePaths.length > 0) {
    lines.push(
      `${String(input.tier1.snippetBasePaths.length)} snippet base path${input.tier1.snippetBasePaths.length === 1 ? '' : 's'}`,
    );
  }

  return lines.join('\n');
}
