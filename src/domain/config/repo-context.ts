/**
 * Parse a Material `repo_url` value into a structured context the magiclink
 * normalizer uses to expand `#123`, `user/repo#456`, `@user`, and commit-SHA
 * shortcuts into full URLs.
 *
 * Pure: takes a string (or null), returns a `RepoContext` or null. No I/O.
 *
 * Recognized hosts:
 *   github.com, www.github.com           → provider: 'github'
 *   gitlab.com, www.gitlab.com           → provider: 'gitlab'
 *   bitbucket.org, www.bitbucket.org     → provider: 'bitbucket'
 *
 * Self-hosted variants (e.g. github.example.com) are NOT auto-detected
 * here — they require explicit configuration. Phase 1 supports the public
 * SaaS hosts only; the magiclink normalizer no-ops if context is null, so
 * unrecognized inputs simply skip the autolinking pass.
 */

export type RepoProvider = 'github' | 'gitlab' | 'bitbucket';

export interface RepoContext {
  readonly provider: RepoProvider;
  readonly owner: string;
  readonly repo: string;
  /** The canonical repo base, no trailing slash. */
  readonly baseUrl: string;
}

const HOST_TO_PROVIDER: ReadonlyMap<string, RepoProvider> = new Map([
  ['github.com', 'github'] as const,
  ['www.github.com', 'github'] as const,
  ['gitlab.com', 'gitlab'] as const,
  ['www.gitlab.com', 'gitlab'] as const,
  ['bitbucket.org', 'bitbucket'] as const,
  ['www.bitbucket.org', 'bitbucket'] as const,
]);

export function parseRepoUrl(url: string | null): RepoContext | null {
  if (url === null || url.length === 0) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const provider = HOST_TO_PROVIDER.get(parsed.host);
  if (provider === undefined) {
    return null;
  }
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) {
    return null;
  }
  const owner = segments[0] ?? '';
  const repo = (segments[1] ?? '').replace(/\.git$/, '');
  if (owner.length === 0 || repo.length === 0) {
    return null;
  }
  const baseUrl = `https://${parsed.host}/${owner}/${repo}`;
  return { provider, owner, repo, baseUrl };
}
