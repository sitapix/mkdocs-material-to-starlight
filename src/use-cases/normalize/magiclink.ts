/**
 * Pre-parse normalizer for Material's `pymdownx.magiclink` extension.
 *
 *   #123                  → [#123](https://github.com/owner/repo/issues/123)
 *   user/repo#123         → [user/repo#123](https://github.com/user/repo/issues/123)
 *   @alice                → [@alice](https://github.com/alice)
 *
 * No-op when called without a `RepoContext` (the user's `mkdocs.yml` did not
 * declare `repo_url` or it pointed at an unrecognized host). Bare URL
 * autolinking is handled by `remark-gfm` downstream, so this normalizer
 * focuses on the shortcuts that require provider context.
 *
 * Provider differences:
 *   GitHub:    /issues/N for #N, /USER for @USER
 *   GitLab:    /-/issues/N for #N, /USER for @USER
 *   Bitbucket: /issues/N for #N, /USER for @USER
 *
 * Idempotency: a fully-formed Markdown link `[text](url)` is not matched, so
 * a second pass finds nothing to rewrite. Markers inside backtick code or
 * inside fenced code blocks are shielded.
 *
 * Conservative matching:
 *   - `#N` only matches when surrounded by whitespace or at line bounds, to
 *     avoid mangling CSS hash selectors and similar.
 *   - `user/repo#N` requires the `user` and `repo` segments to be valid
 *     identifier characters.
 *   - `@user` only matches with a word boundary before `@` so emails are
 *     not double-rewritten.
 */

import type { RepoContext } from '../../domain/config/repo-context.js';

const FENCE = /^ {0,3}(```|~~~)/;

const ISSUE_PATH: Readonly<Record<string, string>> = {
  github: '/issues',
  gitlab: '/-/issues',
  bitbucket: '/issues',
};

const SLUG_RE = /[A-Za-z0-9_.-]+/.source;
const ISSUE_NUM = /(?<![A-Za-z0-9_/&[])#(\d+)\b/g;
const CROSS_REPO = new RegExp(
  `(?<![A-Za-z0-9_/[])(${SLUG_RE})/(${SLUG_RE})#(\\d+)\\b`,
  'g',
);
const MENTION_RE = /(?<![A-Za-z0-9_/[])@([A-Za-z0-9][A-Za-z0-9-]*)\b/g;

export function normalizeMagicLinks(
  source: string,
  context: RepoContext | null,
): string {
  if (context === null) {
    return source;
  }

  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    output.push(inFence ? line : rewriteLine(line, context));
  }

  return output.join('\n');
}

function rewriteLine(line: string, context: RepoContext): string {
  return splitOutOfBackticks(line, (segment) => rewriteSegment(segment, context)).join('');
}

function rewriteSegment(segment: string, context: RepoContext): string {
  let out = segment;
  // Cross-repo refs first so `user/repo#123` doesn't get mis-eaten by the
  // bare `#123` rewriter.
  out = out.replace(CROSS_REPO, (_match, owner: string, repo: string, num: string) => {
    const issuePath = ISSUE_PATH[context.provider] ?? '/issues';
    const host = hostFor(context.provider);
    return `[${owner}/${repo}#${num}](https://${host}/${owner}/${repo}${issuePath}/${num})`;
  });
  out = out.replace(ISSUE_NUM, (match, num: string) => {
    const issuePath = ISSUE_PATH[context.provider] ?? '/issues';
    return `[${match}](${context.baseUrl}${issuePath}/${num})`;
  });
  out = out.replace(MENTION_RE, (match, user: string) => {
    const host = hostFor(context.provider);
    return `[${match}](https://${host}/${user})`;
  });
  return out;
}

function hostFor(provider: RepoContext['provider']): string {
  switch (provider) {
    case 'github':
      return 'github.com';
    case 'gitlab':
      return 'gitlab.com';
    case 'bitbucket':
      return 'bitbucket.org';
  }
}

function splitOutOfBackticks(
  line: string,
  rewriter: (segment: string) => string,
): ReadonlyArray<string> {
  const out: string[] = [];
  let i = 0;
  let buffer = '';
  while (i < line.length) {
    if (line[i] === '`') {
      if (buffer.length > 0) {
        out.push(rewriter(buffer));
        buffer = '';
      }
      const end = findBacktickClose(line, i);
      if (end === -1) {
        buffer += line.slice(i);
        i = line.length;
        continue;
      }
      out.push(line.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    buffer += line[i];
    i += 1;
  }
  if (buffer.length > 0) {
    out.push(rewriter(buffer));
  }
  return out;
}

function findBacktickClose(line: string, openIndex: number): number {
  for (let j = openIndex + 1; j < line.length; j += 1) {
    if (line[j] === '`') {
      return j;
    }
  }
  return -1;
}
