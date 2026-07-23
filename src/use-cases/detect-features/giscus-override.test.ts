import { describe, expect, it } from 'vitest';
import { parseGiscusFromPartial } from './giscus-override.js';

const PARTIAL = `
<script
  src="https://giscus.app/client.js"
  data-repo="acme/docs"
  data-repo-id="R_kgDOAbc123"
  data-category="Comments"
  data-category-id="DIC_kwDOAbc123"
  data-mapping="pathname"
  crossorigin="anonymous"
  async
></script>
`;

describe('parseGiscusFromPartial', () => {
  it('extracts the four required starlight-giscus options from a Material comments partial', () => {
    const out = parseGiscusFromPartial(PARTIAL);
    expect(out).toEqual({
      repo: 'acme/docs',
      repoId: 'R_kgDOAbc123',
      category: 'Comments',
      categoryId: 'DIC_kwDOAbc123',
    });
  });

  it('accepts single-quoted attributes', () => {
    const out = parseGiscusFromPartial(
      `<script src='https://giscus.app/client.js' data-repo='a/b' data-repo-id='r' data-category='c' data-category-id='ci'></script>`,
    );
    expect(out?.repo).toBe('a/b');
  });

  it('returns null when any required attribute is missing', () => {
    // starlight-giscus hard-requires all four; a partial config would
    // crash astro:config:setup, so the caller must fall back to the
    // recommend-only diagnostic.
    const noCategory = PARTIAL.replace(/data-category="[^"]+"\s*/, '');
    expect(parseGiscusFromPartial(noCategory)).toBeNull();
  });

  it('returns null for non-Giscus comment partials (Disqus, Utterances)', () => {
    expect(
      parseGiscusFromPartial(
        '<div id="disqus_thread"></div><script src="//x.disqus.com/embed.js">',
      ),
    ).toBeNull();
  });
});
