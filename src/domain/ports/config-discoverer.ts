/**
 * ConfigDiscoverer port — finds candidate `mkdocs.yml` / `mkdocs.yaml`
 * files under a project root.
 *
 * Pure declaration. The wizard and `convertSiteFromDisk` consume this
 * port to recover when the user points the converter at a wrapper dir
 * (monorepo with docs under `website/`, etc.). Adapters MUST cap walk
 * depth and prune heavyweight directories (`node_modules`, `dist`, ...)
 * so the discovery step stays fast on real repos.
 */

import type { Result } from '../result.js';
import type { DirectoryReadError } from './directory-reader.js';

export interface ConfigDiscoverer {
  /**
   * List every `mkdocs.yml` / `mkdocs.yaml` under `root`. Paths are
   * returned relative to `root` and use POSIX separators.
   */
  findMkdocsConfigs(
    root: string,
  ): Promise<Result<ReadonlyArray<string>, DirectoryReadError>>;
}
