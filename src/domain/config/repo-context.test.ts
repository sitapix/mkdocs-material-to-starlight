import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from './repo-context.js';

describe('parseRepoUrl', () => {
  it('returns null for null / empty / unrecognized input', () => {
    expect(parseRepoUrl(null)).toBeNull();
    expect(parseRepoUrl('')).toBeNull();
    expect(parseRepoUrl('not a url')).toBeNull();
    expect(parseRepoUrl('https://example.com/foo/bar')).toBeNull();
  });

  it('parses a github.com repo URL', () => {
    expect(parseRepoUrl('https://github.com/foo/bar')).toEqual({
      provider: 'github',
      owner: 'foo',
      repo: 'bar',
      baseUrl: 'https://github.com/foo/bar',
    });
  });

  it('parses a gitlab.com repo URL', () => {
    expect(parseRepoUrl('https://gitlab.com/myorg/myrepo')).toEqual({
      provider: 'gitlab',
      owner: 'myorg',
      repo: 'myrepo',
      baseUrl: 'https://gitlab.com/myorg/myrepo',
    });
  });

  it('parses a bitbucket.org repo URL', () => {
    expect(parseRepoUrl('https://bitbucket.org/team/proj')).toEqual({
      provider: 'bitbucket',
      owner: 'team',
      repo: 'proj',
      baseUrl: 'https://bitbucket.org/team/proj',
    });
  });

  it('strips a trailing .git from the repo segment', () => {
    expect(parseRepoUrl('https://github.com/foo/bar.git')?.repo).toBe('bar');
  });

  it('returns null for a URL with too few path segments', () => {
    expect(parseRepoUrl('https://github.com/foo')).toBeNull();
    expect(parseRepoUrl('https://github.com/')).toBeNull();
  });

  it('handles a URL with extra trailing path segments by ignoring them', () => {
    const ctx = parseRepoUrl('https://github.com/foo/bar/issues/123');
    expect(ctx?.owner).toBe('foo');
    expect(ctx?.repo).toBe('bar');
  });
});
