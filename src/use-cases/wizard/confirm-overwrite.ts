/**
 * Guard the wizard against silently clobbering an existing project.
 *
 * The converter's runtime path requires `--force` when `outputDir` is a
 * non-empty directory. Without this guard, a wizard user picks an existing
 * dir, blasts through tier 1/2, hits Convert, and only then gets a runtime
 * error. Worse: someone passing through quickly might trample an
 * unrelated project.
 *
 * This helper interleaves the safety check with the wizard so the warning
 * fires AT the moment the destination is chosen — and the confirm prompt
 * defaults to NO, matching the destructive-action convention used by every
 * mainstream CLI (`rm -i`, `git clean`, `cargo init --force`).
 */

import type { DirInspector } from '../../domain/wizard/ports/dir-inspector.js';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';

export type ConfirmOverwriteResult = 'no-need' | 'confirmed' | 'cancelled';

export async function confirmOverwriteIfNeeded(
  prompter: Prompter,
  inspector: DirInspector,
  outputDir: string,
): Promise<ConfirmOverwriteResult> {
  const state = await inspector.inspect(outputDir);
  if (state === 'missing' || state === 'empty') return 'no-need';

  // Pick the warning copy by state. The plain "non-empty" case is a generic
  // overwrite warning; "astro-project" is escalated because the user is
  // about to clobber a real working Starlight/Astro site (config + content).
  // A typo here costs more than data — it costs unstaged tracked work.
  const path = prompter.highlight.value(outputDir);
  if (state === 'astro-project') {
    prompter.log.warn(
      `${path} looks like an existing Astro/Starlight project (astro.config.* + src/content/docs/). Converting overwrites its files.`,
    );
  } else {
    prompter.log.warn(
      `${path} already exists and is not empty. Converting overwrites the files inside.`,
    );
  }
  const confirmed = await prompter.confirm({
    message: 'Overwrite existing files in the output directory?',
    initialValue: false,
    active: 'Yes (pass --force; replaces matching files)',
    inactive: 'No (cancel)',
  });
  if (confirmed === null) return 'cancelled';
  return confirmed ? 'confirmed' : 'cancelled';
}
