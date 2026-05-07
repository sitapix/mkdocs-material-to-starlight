/**
 * Decide which `theme.logo` and `theme.favicon` paths actually make it
 * into the generated astro.config.mjs. The rules:
 *
 *   1. CDN URLs (`https://…/logo.svg`) are dropped: Starlight resolves
 *      both fields as Vite imports and an HTTP URL fails Rollup with
 *      "failed to resolve import" at build time.
 *   2. The favicon must use one of Starlight's five accepted extensions
 *      (.ico, .gif, .jpg/.jpeg, .png, .svg). Other formats (.webp,
 *      .avif, …) are dropped to avoid a config-load crash; the diagnostic
 *      surfaces the rejection.
 *   3. The file must exist on disk under `docsDir`. A missing logo/
 *      favicon path would otherwise emit a config that references a
 *      missing Vite asset and crash the build.
 *
 * The orchestrator uses the resolved values to (a) decide whether to
 * emit `logo: {…}` / `favicon: …` in astro.config and (b) drive the
 * post-write asset-copy phase.
 */

import { join } from 'node:path';
import type { FileSystem } from '../../domain/ports/file-system.js';

const FAVICON_ACCEPTED_EXT = /\.(ico|gif|jpe?g|png|svg)$/i;
const ABSOLUTE_URL = /^[a-z][a-z0-9+\-.]*:\/\//i;

export interface ResolveThemeAssetsInput {
  readonly themeOptions: Readonly<Record<string, unknown>>;
  readonly fs: FileSystem;
  readonly docsDir: string;
}

export interface ThemeAssetsResolution {
  /** The original `theme.logo` candidate path (after CDN-URL filtering)
   * — used by the orchestrator to track diagnostic context. */
  readonly logoSrcCandidate: string | null;
  /** The original `theme.favicon` candidate path (after CDN-URL filtering). */
  readonly faviconRawCandidate: string | null;
  /** The logo path that survives existence check; null when missing. */
  readonly logoSrc: string | null;
  /** The favicon path that survives extension + existence checks; null
   * when rejected. */
  readonly faviconRaw: string | null;
  /** True iff the favicon extension was rejected (drives a warning
   * diagnostic that names the unsupported format). */
  readonly faviconExtensionRejected: boolean;
}

export async function resolveThemeAssets(
  input: ResolveThemeAssetsInput,
): Promise<ThemeAssetsResolution> {
  const isLocalAssetPath = (v: unknown): v is string =>
    typeof v === 'string' && !ABSOLUTE_URL.test(v);
  const logoSrcCandidate = isLocalAssetPath(input.themeOptions.logo)
    ? input.themeOptions.logo
    : null;
  const faviconRawCandidate = isLocalAssetPath(input.themeOptions.favicon)
    ? input.themeOptions.favicon
    : null;

  const exists = async (rel: string | null): Promise<boolean> =>
    rel === null ? false : input.fs.exists(join(input.docsDir, rel));

  const logoSrc = (await exists(logoSrcCandidate)) ? logoSrcCandidate : null;

  const faviconExtensionRejected =
    faviconRawCandidate !== null && !FAVICON_ACCEPTED_EXT.test(faviconRawCandidate);
  const faviconRawAccepted =
    faviconRawCandidate !== null && !faviconExtensionRejected ? faviconRawCandidate : null;
  const faviconRaw = (await exists(faviconRawAccepted)) ? faviconRawAccepted : null;

  return {
    logoSrcCandidate,
    faviconRawCandidate,
    logoSrc,
    faviconRaw,
    faviconExtensionRejected,
  };
}
