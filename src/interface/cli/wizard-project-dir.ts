/**
 * Project-dir picker for the wizard. Re-prompts on missing or invalid
 * mkdocs.yml so a typo doesn't drop the user back to the shell, and runs
 * the read+parse under a spinner so slow disks don't look like a hang.
 *
 * If `<dir>/mkdocs.yml` is missing but the project tree contains one or
 * more candidates (e.g. a monorepo with `website/mkdocs.yml`), the picker
 * surfaces them via discovery — auto-confirming a single match or
 * presenting a select prompt for multiple — instead of forcing the user
 * to retype a deeper path. That redirect is the single biggest UX win
 * for first-time runs against unfamiliar repos.
 *
 * Pulled out of `wizard-runner.ts` to keep that file under the size cap
 * and to give the spinner-driven recovery loop a single home.
 */

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import { createNodeConfigDiscoverer } from '../../infrastructure/fs/node-config-discoverer.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { parseMkdocsConfig } from '../../use-cases/config/parse-mkdocs.js';
import {
  type ConfigCandidate,
  rankCandidates,
} from '../../use-cases/discover-config/rank-candidates.js';

export interface LoadedConfig {
  readonly projectDir: string;
  readonly configValue: MkdocsConfig;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Max attempts to re-prompt for a project dir before giving up. */
const PROJECT_DIR_MAX_ATTEMPTS = 3;

export async function readProjectDirInteractively(
  prompter: Prompter,
  initialHint: string,
): Promise<LoadedConfig | 'cancelled'> {
  const yaml = createJsYamlDecoder();

  // Fast path: when the user is already in a directory with mkdocs.yml at
  // root, surface the detection and let them confirm. Pre-selects "yes"
  // because that matches the cwd they typed `npx ...` from, but the prompt
  // is still there so they're never surprised about which project the
  // wizard is acting on. Decline → fall through to the picker.
  const directConfig = join(initialHint, 'mkdocs.yml');
  if (await fileExists(directConfig)) {
    prompter.log.step(
      `Found mkdocs.yml in ${prompter.highlight.value(initialHint)} (your current directory).`,
    );
    const useIt = await prompter.confirm({
      message: 'Use this project?',
      initialValue: true,
      active: 'Yes (convert this project)',
      inactive: 'No (let me pick a different one)',
    });
    if (useIt === null) return 'cancelled';
    if (useIt === true) {
      const loaded = await loadAndParseConfig(prompter, yaml, initialHint, directConfig);
      if (loaded !== null) return loaded;
    }
  }

  let hint = initialHint;
  for (let attempt = 0; attempt < PROJECT_DIR_MAX_ATTEMPTS; attempt++) {
    const inputDir = await prompter.path({
      message: 'Project directory (containing mkdocs.yml)',
      initialValue: hint,
      directory: true,
      validate: (value) => {
        if (value.trim().length === 0) return 'Please enter a path.';
        return undefined;
      },
    });
    if (inputDir === null) return 'cancelled';

    const resolved = await resolveConfigPathInteractively(prompter, inputDir);
    if (resolved === 'cancelled') return 'cancelled';
    if (resolved === 'not-found') {
      prompter.log.error(
        `No mkdocs.yml found at ${inputDir} (searched up to 4 levels deep). ` +
          `Point this wizard at the directory that contains mkdocs.yml. That is ` +
          `usually the project root, or a subdirectory like docs/ or website/. ` +
          `Primer on mkdocs.yml: https://www.mkdocs.org/user-guide/configuration/.`,
      );
      hint = inputDir;
      continue;
    }

    const loaded = await loadAndParseConfig(
      prompter,
      yaml,
      resolved.effectiveDir,
      resolved.configPath,
    );
    if (loaded !== null) return loaded;
    hint = inputDir;
  }
  prompter.log.error(
    `Could not locate mkdocs.yml after ${String(PROJECT_DIR_MAX_ATTEMPTS)} attempts. ` +
      `Re-run the wizard with the path as an argument (e.g. \`mkdocs-material-to-starlight ./docs/\`), ` +
      `or run \`mkdocs-material-to-starlight --help\` for non-interactive options.`,
  );
  return 'cancelled';
}

type ResolveResult =
  | { readonly effectiveDir: string; readonly configPath: string }
  | 'cancelled'
  | 'not-found';

async function resolveConfigPathInteractively(
  prompter: Prompter,
  inputDir: string,
): Promise<ResolveResult> {
  const rootConfig = join(inputDir, 'mkdocs.yml');
  if (await fileExists(rootConfig)) {
    return { effectiveDir: inputDir, configPath: rootConfig };
  }

  const spin = prompter.spinner({
    initialMessage: `Searching ${inputDir} for mkdocs.yml`,
  });
  const discoverer = createNodeConfigDiscoverer();
  const discovery = await discoverer.findMkdocsConfigs(inputDir);
  if (!discovery.ok) {
    spin.error(`Could not search ${inputDir}: ${discovery.error.message}`);
    return 'not-found';
  }
  const ranked = rankCandidates(discovery.value);
  if (ranked.kind === 'none') {
    spin.error(`No mkdocs.yml found under ${inputDir}.`);
    return 'not-found';
  }
  spin.stop(`Found ${String(1 + ranked.alternatives.length)} mkdocs config file(s).`);

  const chosen =
    ranked.alternatives.length === 0
      ? await confirmSingle(prompter, ranked.primary)
      : await pickFromMany(prompter, ranked.primary, ranked.alternatives);
  if (chosen === 'cancelled' || chosen === null) return 'cancelled';
  if (chosen === 'declined') return 'not-found';

  return {
    effectiveDir: join(inputDir, chosen.configDir),
    configPath: join(inputDir, chosen.relPath),
  };
}

async function confirmSingle(
  prompter: Prompter,
  candidate: ConfigCandidate,
): Promise<ConfigCandidate | 'declined' | 'cancelled' | null> {
  const ok = await prompter.confirm({
    message: `Use ${candidate.relPath}?`,
    initialValue: true,
  });
  if (ok === null) return 'cancelled';
  return ok ? candidate : 'declined';
}

async function pickFromMany(
  prompter: Prompter,
  primary: ConfigCandidate,
  alternatives: ReadonlyArray<ConfigCandidate>,
): Promise<ConfigCandidate | 'cancelled' | null> {
  const all = [primary, ...alternatives];
  const choice = await prompter.select<string>({
    message: `Multiple mkdocs.yml found — pick one:`,
    options: all.map((c) =>
      c.reasons.length > 0
        ? { value: c.relPath, label: c.relPath, hint: c.reasons.join('; ') }
        : { value: c.relPath, label: c.relPath },
    ),
    initialValue: primary.relPath,
  });
  if (choice === null) return 'cancelled';
  return all.find((c) => c.relPath === choice) ?? null;
}

/**
 * Read + parse a known config file under a spinner. Returns null on any
 * failure (file unreadable, YAML invalid, schema invalid) so the caller
 * can fall through to the retry loop. Errors surface via spinner.error
 * before the null is returned, so the user always sees what went wrong.
 */
async function loadAndParseConfig(
  prompter: Prompter,
  yaml: ReturnType<typeof createJsYamlDecoder>,
  effectiveDir: string,
  configPath: string,
): Promise<LoadedConfig | null> {
  const spin = prompter.spinner({ initialMessage: `Reading ${configPath}` });
  let configText: string;
  try {
    configText = await readFile(configPath, 'utf8');
  } catch {
    spin.error(`No mkdocs.yml at ${configPath}.`);
    return null;
  }
  spin.message('Parsing mkdocs.yml');
  const decoded = yaml.decode(configText);
  if (!decoded.ok) {
    spin.error(`mkdocs.yml is not valid YAML: ${decoded.error.message}`);
    return null;
  }
  const config = parseMkdocsConfig(decoded.value);
  if (!config.ok) {
    spin.error(`mkdocs.yml is missing required fields: ${config.error.message}`);
    return null;
  }
  spin.stop(`Loaded ${configPath}`);
  return { projectDir: effectiveDir, configValue: config.value };
}
