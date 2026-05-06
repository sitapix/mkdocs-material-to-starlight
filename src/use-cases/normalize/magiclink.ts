/**
 * Pre-parse normalizer for `pymdownx.magiclink`.
 *
 *   #123          → [#123](https://github.com/owner/repo/issues/123)
 *   user/repo#123 → [user/repo#123](https://github.com/user/repo/issues/123)
 *   @alice        → [@alice](https://github.com/alice)
 *
 * No-op without a `RepoContext` (no `repo_url` or unknown host). Bare URLs
 * are handled by remark-gfm; this pass focuses on provider-context shortcuts.
 *
 * Provider issue paths:
 *   GitHub, Bitbucket: /issues/N
 *   GitLab:            /-/issues/N
 * User profiles are `/USER` for all three.
 *
 * Conservative matching: `#N` requires surrounding whitespace or line bounds;
 * `user/repo#N` requires identifier-char segments; `@user` requires a word
 * boundary before `@` so emails pass through. Idempotent and fence-shielded.
 */

import type { RepoContext } from '../../domain/config/repo-context.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

const ISSUE_PATH: Readonly<Record<string, string>> = {
  github: '/issues',
  gitlab: '/-/issues',
  bitbucket: '/issues',
};

const SLUG_RE = /[A-Za-z0-9_.-]+/.source;
const ISSUE_NUM = /(?<![A-Za-z0-9_/&[])#(\d+)\b/g;
const PR_NUM = /(?<![A-Za-z0-9_/&[])!(\d+)\b/g;
const CROSS_REPO = new RegExp(
  `(?<![A-Za-z0-9_/[])(${SLUG_RE})/(${SLUG_RE})#(\\d+)\\b`,
  'g',
);
const MENTION_RE = /(?<![A-Za-z0-9_/[])@([A-Za-z0-9][A-Za-z0-9-]*)\b/g;
// Social shorthand: `@user@provider` for cross-provider mentions
// (`@alice@gitlab`, `@bob@mastodon.social`). Provider segment matches
// dot-separated host-like tokens. Must run BEFORE MENTION_RE because
// MENTION_RE would otherwise consume the leading `@user` and break the link.
const SOCIAL_MENTION_RE = /(?<![A-Za-z0-9_/[])@([A-Za-z0-9][A-Za-z0-9-]*)@([A-Za-z][A-Za-z0-9.-]*[A-Za-z0-9])\b/g;
const SOCIAL_HOSTS: Readonly<Record<string, string>> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  twitter: 'twitter.com',
  x: 'x.com',
};

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
    if (isFenceLine(line)) {
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
  // GitLab-style PR/MR shorthand `!N`. Only meaningful when provider is
  // GitLab; for github/bitbucket we leave the source untouched (those
  // platforms use `#N` for both issues and PRs).
  if (context.provider === 'gitlab') {
    out = out.replace(PR_NUM, (match, num: string) => {
      return `[${match}](${context.baseUrl}/-/merge_requests/${num})`;
    });
  }
  // Social shorthand `@user@provider` runs BEFORE plain `@user` so the
  // longer match wins. The displayed text preserves the original form
  // (`@alice@gitlab`); the link points at the provider profile.
  out = out.replace(SOCIAL_MENTION_RE, (match, user: string, provider: string) => {
    const host = SOCIAL_HOSTS[provider.toLowerCase()] ?? provider;
    return `[${match}](https://${host}/${user})`;
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
