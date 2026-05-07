/**
 * Read every Python hook file referenced in `mkdocs.yml`'s `hooks:` list
 * and classify it into one or more archetypes (slug rewriters, build
 * hooks, page-content modifiers, …). Emits a diagnostic per hook so
 * users see what they need to recreate as a remark/rehype plugin or
 * Astro endpoint.
 *
 * Pulled out of `interface/api/convert-site.ts` so the orchestrator
 * stays under the size budget. Side-effecting (reads via the FileSystem
 * port) but small + linear; the orchestrator decides where to slot the
 * returned diagnostics.
 */

import { join } from 'node:path';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { classifyHook } from './hook-archetypes.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface DiagnoseHooksInput {
  readonly projectDir: string;
  readonly fs: FileSystem;
  /** Source-relative paths from `mkdocs.yml`'s `extras.hooks:` (or
   * top-level `hooks:`) — already filtered to strings. */
  readonly hookPaths: ReadonlyArray<string>;
}

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export async function diagnoseHooks(
  input: DiagnoseHooksInput,
): Promise<ReadonlyArray<TaggedDiagnostic>> {
  const out: TaggedDiagnostic[] = [];
  for (const hookRel of input.hookPaths) {
    const hookFull = join(input.projectDir, hookRel);
    const read = await input.fs.readText(hookFull);
    if (!read.ok) {
      out.push({
        sourcePath: hookRel,
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'hook-file-not-found',
          source: SOURCE,
          message:
            `mkdocs.yml hooks: references "${hookRel}" but the file could not be read at ${hookFull}.`,
        }),
      });
      continue;
    }
    const archetypes = classifyHook(read.value);
    out.push({
      sourcePath: hookRel,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'hook-archetype-detected',
        source: SOURCE,
        message:
          `Python hook archetypes: ${archetypes.join(', ')}. The converter cannot evaluate Python; reproduce the behaviour as remark/rehype plugin, Starlight component override, or Astro endpoint.`,
      }),
    });
  }
  return out;
}

export function extractHookPaths(
  extras: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> {
  const raw = extras.hooks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string');
}
