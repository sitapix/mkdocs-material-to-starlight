/**
 * Load and parse `mkdocs.yml` for a converter run.
 *
 * Pure use-case: takes the user's input directory and the four ports it
 * needs (filesystem, directory reader, yaml decoder, config discoverer)
 * and returns either the parsed `MkdocsConfig` plus the resolved project
 * directory, or a typed error describing what went wrong.
 *
 * The orchestrator in `interface/api/convert-site.ts` previously inlined
 * this entire pipeline (~110 lines): auto-discovery, INHERIT resolution,
 * Python/env tag preprocessing, YAML decode, parse, meta-bundle
 * expansion, plus error-message enrichment when an INHERIT target is
 * missing. Pulling it out keeps the orchestrator focused on wiring and
 * means this concern can be tested in isolation against in-memory ports.
 *
 * The returned error union maps 1:1 to the four `config-*` codes the
 * convert API surfaces, so the orchestrator's translation layer is a
 * straight switch with no information loss.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { DirectoryReader } from '../../domain/ports/directory-reader.js';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import type { ConfigDiscoverer } from '../../domain/ports/config-discoverer.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { resolveProjectDir } from '../discover-config/resolve-project-dir.js';
import { resolveInherits } from '../config/inherit-config.js';
import { preprocessMkdocsEnvTags } from '../config/preprocess-mkdocs-env-tags.js';
import { preprocessMkdocsPythonTags } from '../config/preprocess-mkdocs-python-tags.js';
import { parseMkdocsConfig } from '../config/parse-mkdocs.js';
import { expandMetaBundles } from '../config/expand-meta-bundles.js';
import { join } from 'node:path';

export interface LoadMkdocsConfigPorts {
  readonly fs: FileSystem;
  readonly dirReader: DirectoryReader;
  readonly yamlDecoder: YamlDecoder;
  readonly configDiscoverer: ConfigDiscoverer;
}

export interface LoadMkdocsConfigInput {
  /** The path the user passed; may be a wrapper dir requiring discovery. */
  readonly inputDir: string;
}

export interface LoadedAutoDiscovery {
  readonly fromDir: string;
  readonly discoveredRelPath: string;
}

export interface LoadMkdocsConfigOutput {
  readonly projectDir: string;
  readonly config: MkdocsConfig;
  readonly autoDiscovery: LoadedAutoDiscovery | null;
  /**
   * `!!python/...` tags scrubbed during preprocessing. The orchestrator
   * surfaces each as a `yaml-python-tag-stripped` info diagnostic so
   * users see why their config rendered without the tag's effect.
   */
  readonly strippedPythonTags: ReadonlyArray<string>;
}

export type LoadMkdocsConfigError =
  | {
      readonly kind: 'config-ambiguous';
      readonly searchedDir: string;
      readonly candidates: ReadonlyArray<string>;
    }
  | { readonly kind: 'config-not-found'; readonly searchedDir: string }
  | { readonly kind: 'yaml-decode-failed'; readonly message: string }
  | { readonly kind: 'config-invalid'; readonly message: string };

export async function loadMkdocsConfig(
  input: LoadMkdocsConfigInput,
  ports: LoadMkdocsConfigPorts,
): Promise<Result<LoadMkdocsConfigOutput, LoadMkdocsConfigError>> {
  const { fs, dirReader, yamlDecoder, configDiscoverer } = ports;

  const resolved = await resolveProjectDir(input.inputDir, fs, configDiscoverer);
  if (!resolved.ok) {
    if (resolved.error.kind === 'ambiguous') {
      return err({
        kind: 'config-ambiguous',
        searchedDir: resolved.error.searchedDir,
        candidates: resolved.error.candidates,
      });
    }
    return err({ kind: 'config-not-found', searchedDir: input.inputDir });
  }
  const projectDir = resolved.value.projectDir;
  const autoDiscovery = resolved.value.autoDiscovery;

  const configPath = join(projectDir, 'mkdocs.yml');
  const configRead = await fs.readText(configPath);
  if (!configRead.ok) {
    return err({ kind: 'config-not-found', searchedDir: projectDir });
  }

  const inherited = await resolveInherits(configRead.value, configPath, fs);
  const pythonStripped = preprocessMkdocsPythonTags(
    preprocessMkdocsEnvTags(inherited.source),
  );
  const decoded = yamlDecoder.decode(pythonStripped.source);
  if (!decoded.ok) {
    return err({ kind: 'yaml-decode-failed', message: decoded.error.message });
  }

  const parseResult = parseMkdocsConfig(decoded.value);
  if (!parseResult.ok) {
    if (inherited.missing.length > 0) {
      const candidatesNote = await scanInheritCandidates(dirReader, projectDir);
      return err({
        kind: 'config-invalid',
        message:
          `${parseResult.error.message}. ` +
          `Note: mkdocs.yml uses INHERIT but the referenced file(s) could not be read: ` +
          inherited.missing.join(', ') +
          `. The missing file would have supplied the field(s) the parser is rejecting. ` +
          `Common causes: an unfetched git submodule (run \`git submodule update --init --recursive\`), ` +
          `a stale path in the INHERIT directive, or a CI-generated symlink that doesn't exist locally.` +
          candidatesNote,
      });
    }
    return err({ kind: 'config-invalid', message: parseResult.error.message });
  }

  return ok({
    projectDir,
    autoDiscovery,
    config: {
      ...parseResult.value,
      markdownExtensions: expandMetaBundles(parseResult.value.markdownExtensions),
    },
    strippedPythonTags: pythonStripped.stripped,
  });
}

async function scanInheritCandidates(
  dirReader: DirectoryReader,
  projectDir: string,
): Promise<string> {
  // Quick scan: look for any other `mkdocs.yml`/`mkdocs.yaml` files in
  // the project that might be the actual INHERIT target the user
  // intended (common with renamed submodules — e.g. `docs_template/`
  // referenced but the submodule was renamed to `website-template/`).
  const yamlListing = await dirReader.list(projectDir, ['.yml', '.yaml']);
  if (!yamlListing.ok) return '';
  const candidates = yamlListing.value
    .filter((p) => {
      const base = p.split('/').pop() ?? '';
      return base === 'mkdocs.yml' || base === 'mkdocs.yaml';
    })
    .filter((p) => p !== 'mkdocs.yml' && p !== 'mkdocs.yaml')
    .slice(0, 5);
  if (candidates.length === 0) return '';
  return (
    ` Found ${String(candidates.length)} other mkdocs config file${candidates.length === 1 ? '' : 's'} in the project that might be the intended target: ` +
    candidates.map((c) => `\`${c}\``).join(', ') +
    `. Did you mean one of these? Update the \`INHERIT:\` line, or symlink the expected directory.`
  );
}
