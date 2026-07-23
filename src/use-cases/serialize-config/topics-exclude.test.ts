import { describe, expect, it } from 'vitest';
import { computeUnclaimedSlugs } from './topics-exclude.js';

describe('computeUnclaimedSlugs', () => {
  it('returns pages the sidebar does not claim (field-tested: typer environment-variables)', () => {
    const out = computeUnclaimedSlugs(
      [{ kind: 'group', label: 'Guide', items: [{ kind: 'slug', slug: 'guide/intro' }] }],
      ['guide/intro', 'environment-variables', ''],
    );
    expect(out).toEqual(['environment-variables']);
  });

  it('treats autogenerate directories as claiming their whole subtree and index', () => {
    const out = computeUnclaimedSlugs(
      [{ kind: 'auto', label: 'API', directory: 'api' }],
      ['api', 'api/auth', 'api/tokens/refresh', 'other'],
    );
    expect(out).toEqual(['other']);
  });

  it('never returns the root slug (handled by the unconditional "/" exclusion)', () => {
    expect(computeUnclaimedSlugs([], [''])).toEqual([]);
  });

  it('walks nested groups', () => {
    const out = computeUnclaimedSlugs(
      [
        {
          kind: 'group',
          label: 'Outer',
          items: [{ kind: 'group', label: 'Inner', items: [{ kind: 'slug', slug: 'deep/page' }] }],
        },
      ],
      ['deep/page', 'stray'],
    );
    expect(out).toEqual(['stray']);
  });
});
