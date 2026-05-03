import { describe, expect, it } from 'vitest';
import { normalizeMagicLinks } from './magiclink.js';
import type { RepoContext } from '../../domain/config/repo-context.js';

const GITHUB_CONTEXT: RepoContext = {
  provider: 'github',
  owner: 'acme',
  repo: 'docs',
  baseUrl: 'https://github.com/acme/docs',
};

describe('normalizeMagicLinks', () => {
  it('passes through unchanged when no repo context is provided', () => {
    const src = 'See #123 and @alice for more.\n';
    expect(normalizeMagicLinks(src, null)).toBe(src);
  });

  it('rewrites a bare #N issue reference to a link', () => {
    const out = normalizeMagicLinks('See #123 for details.\n', GITHUB_CONTEXT);
    expect(out).toContain('[#123](https://github.com/acme/docs/issues/123)');
  });

  it('rewrites a cross-repo user/repo#N reference', () => {
    const out = normalizeMagicLinks('See foo/bar#42 elsewhere.\n', GITHUB_CONTEXT);
    expect(out).toContain('[foo/bar#42](https://github.com/foo/bar/issues/42)');
  });

  it('rewrites @user mentions', () => {
    const out = normalizeMagicLinks('Thanks @alice and @bob-2 for the help.\n', GITHUB_CONTEXT);
    expect(out).toContain('[@alice](https://github.com/alice)');
    expect(out).toContain('[@bob-2](https://github.com/bob-2)');
  });

  it('uses GitLab issue path /-/issues for gitlab provider', () => {
    const ctx: RepoContext = {
      provider: 'gitlab',
      owner: 'acme',
      repo: 'docs',
      baseUrl: 'https://gitlab.com/acme/docs',
    };
    const out = normalizeMagicLinks('See #99.\n', ctx);
    expect(out).toContain('[#99](https://gitlab.com/acme/docs/-/issues/99)');
  });

  it('does not rewrite #N inside backtick inline code', () => {
    const src = 'Use `#123` as a literal.\n';
    expect(normalizeMagicLinks(src, GITHUB_CONTEXT)).toBe(src);
  });

  it('does not rewrite inside fenced code blocks', () => {
    const src = '```\nSee #123 here.\n```\n';
    expect(normalizeMagicLinks(src, GITHUB_CONTEXT)).toBe(src);
  });

  it('does not rewrite an email address as @user', () => {
    const src = 'Contact me at alice@example.com\n';
    expect(normalizeMagicLinks(src, GITHUB_CONTEXT)).toBe(src);
  });

  it('does not rewrite #N when it follows a slash (URL fragment)', () => {
    const src = 'Visit /api/docs#123 for the section.\n';
    expect(normalizeMagicLinks(src, GITHUB_CONTEXT)).toBe(src);
  });

  it('handles multiple matches on one line independently', () => {
    const out = normalizeMagicLinks(
      'See #1 and #2 and @alice and foo/bar#3.\n',
      GITHUB_CONTEXT,
    );
    expect(out).toContain('[#1]');
    expect(out).toContain('[#2]');
    expect(out).toContain('[@alice]');
    expect(out).toContain('[foo/bar#3]');
  });

  it('is idempotent — running twice equals running once', () => {
    const src = 'See #123 and @alice and foo/bar#42.\n';
    const once = normalizeMagicLinks(src, GITHUB_CONTEXT);
    expect(normalizeMagicLinks(once, GITHUB_CONTEXT)).toBe(once);
  });
});
