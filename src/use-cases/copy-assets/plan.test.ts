import { describe, expect, it } from 'vitest';
import { planAssetCopies } from './plan.js';

describe('planAssetCopies', () => {
  it('returns no copies when there are no assets', () => {
    const plan = planAssetCopies({
      allFiles: ['index.md', 'api/auth.md'],
      markdownExtensions: ['.md', '.mdx'],
    });
    expect(plan).toEqual([]);
  });

  it('returns a copy entry for every non-markdown file', () => {
    const plan = planAssetCopies({
      allFiles: [
        'index.md',
        'images/diagram.png',
        'assets/logo.svg',
        'docs.md',
      ],
      markdownExtensions: ['.md', '.mdx'],
    });
    expect(plan).toEqual([
      { sourceRelative: 'images/diagram.png', destRelative: 'images/diagram.png' },
      { sourceRelative: 'assets/logo.svg', destRelative: 'assets/logo.svg' },
    ]);
  });

  it('preserves nested directory paths', () => {
    const plan = planAssetCopies({
      allFiles: ['guides/setup/diagram.png'],
      markdownExtensions: ['.md'],
    });
    expect(plan).toEqual([
      {
        sourceRelative: 'guides/setup/diagram.png',
        destRelative: 'guides/setup/diagram.png',
      },
    ]);
  });

  it('treats .mdx the same as .md when both are listed as markdown extensions', () => {
    const plan = planAssetCopies({
      allFiles: ['a.md', 'b.mdx', 'c.png'],
      markdownExtensions: ['.md', '.mdx'],
    });
    expect(plan.map((p) => p.sourceRelative)).toEqual(['c.png']);
  });

  it('is case-insensitive on the extension', () => {
    const plan = planAssetCopies({
      allFiles: ['logo.PNG', 'photo.JPG'],
      markdownExtensions: ['.md'],
    });
    expect(plan).toHaveLength(2);
  });
});
