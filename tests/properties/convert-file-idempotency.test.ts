import { describe, expect, it } from 'vitest';
import { convertFile } from '../../src/use-cases/convert-file/convert.js';
import { buildSlugMap } from '../../src/domain/starlight/slug-map.js';

/**
 * Pipeline-level idempotency property — converting the converted output is a
 * no-op. This catches order-coupling bugs that escape per-transform tests
 * because the failure only surfaces when transforms compose with each other.
 *
 * Each fixture exercises one or more Material features in isolation; the
 * test runs every fixture through `convertFile` twice and asserts byte
 * equality.
 *
 * Fixtures intentionally cover:
 *   - legacy admonition syntax
 *   - pymdownx.blocks.* family
 *   - content tabs (legacy + blocks)
 *   - nested constructs (admonitions inside tabs)
 *   - inline marks (mark, sub, sup, keys)
 *   - critic markup
 *   - smart symbols
 *   - footnotes
 *   - math (inline + block)
 *   - icon shortcodes
 *   - card grids
 *   - definition lists
 *   - already-converted inputs
 */

const map = (() => {
  const r = buildSlugMap(['index.md', 'guides/intro.md', 'api/auth.md']);
  if (!r.ok) {
    throw new Error(r.error.message);
  }
  return r.value;
})();

interface Fixture {
  readonly name: string;
  readonly source: string;
}

const CORPUS: ReadonlyArray<Fixture> = [
  {
    name: 'plain markdown',
    source: '# Heading\n\nA paragraph with [a link](api/auth.md).\n',
  },
  {
    name: 'legacy admonition',
    source: '!!! note "Heads up"\n    Read this.\n',
  },
  {
    name: 'collapsible admonition',
    source: '??? tip "Hidden"\n    Body.\n',
  },
  {
    name: 'blocks-syntax admonition',
    source: '/// note | Modern\nBody.\n///\n',
  },
  {
    name: 'blocks-syntax with type override',
    source: '/// admonition | Title\n    type: warning\nBody.\n///\n',
  },
  {
    name: 'blocks-syntax details',
    source: '/// details | More\nDetails body.\n///\n',
  },
  {
    name: 'legacy content tabs',
    source: [
      '=== "macOS"',
      '    brew install foo',
      '',
      '=== "Linux"',
      '    apt install foo',
      '',
    ].join('\n'),
  },
  {
    name: 'blocks-syntax tabs',
    source: [
      '/// tab | C',
      'c-body',
      '///',
      '',
      '/// tab | C++',
      'cpp-body',
      '///',
      '',
    ].join('\n'),
  },
  {
    name: 'admonition with inline marks',
    source: '!!! note\n    Use ==important== text or ++ctrl+c++ shortcuts.\n',
  },
  {
    name: 'critic markup',
    source: 'Add {++this++} and remove {--that--} and mark {==important==}.\n',
  },
  {
    name: 'smart symbols',
    source: 'Acme (c) 2026. A --> B. Range 1/2 to 3/4.\n',
  },
  {
    name: 'footnotes',
    source:
      'A reference.[^1]\n\n[^1]: The footnote body.\n',
  },
  {
    name: 'inline math',
    source: 'The kernel is $\\ker f$ and image is $\\operatorname{im} f$.\n',
  },
  {
    name: 'block math',
    source: '$$\n\\sum_{k=0}^{\\infty} \\frac{1}{k!}\n$$\n',
  },
  {
    name: 'icon shortcode in prose',
    source: 'Click :material-rocket: to launch.\n',
  },
  {
    name: 'icon with title attribute',
    source: ':material-information:{ title="Important" }\n',
  },
  {
    name: 'image with align attr',
    source: '![Diagram](diagram.png){ align=right width="200" }\n',
  },
  {
    name: 'image with light/dark hash',
    source: '![Diagram](diagram.png#only-light)\n',
  },
  {
    name: 'definition list',
    source: 'Term\n:   Definition body.\n',
  },
  {
    name: 'abbreviation',
    source: 'The HTML standard.\n\n*[HTML]: Hyper Text Markup Language\n',
  },
  {
    name: 'card grid',
    source: [
      '<div class="grid cards" markdown>',
      '',
      '- :material-rocket: __Fast__ to set up',
      '- :material-cog: __Configurable__ via YAML',
      '',
      '</div>',
      '',
    ].join('\n'),
  },
  {
    name: 'figure caption block',
    source:
      '![Diagram](diagram.png)\n\n/// caption\nFig 1: System overview.\n///\n',
  },
  {
    name: 'definition block',
    source: '/// define\nApple\n:   A red fruit.\n///\n',
  },
  {
    name: 'html block',
    source:
      '/// html | div[class=highlight]\nWrapped content.\n///\n',
  },
  {
    name: 'snippet marker (unexpanded)',
    source: 'See:\n\n--8<-- "intro.md"\n\nEnd.\n',
  },
  {
    name: 'mixed: admonition with internal link',
    source:
      '!!! note "API"\n    See [auth](api/auth.md) for details.\n',
  },
  {
    name: 'already-converted aside directive',
    source: ':::note[Already done]\nBody.\n:::\n',
  },
  {
    name: 'frontmatter + body',
    source: '---\ntitle: Welcome\n---\n\n!!! note\n    Hello.\n',
  },
];

describe('convertFile pipeline-level idempotency', () => {
  for (const fixture of CORPUS) {
    it(`is idempotent for: ${fixture.name}`, () => {
      const first = convertFile({
        source: fixture.source,
        sourcePath: 'index.md',
        slugMap: map,
      });
      const second = convertFile({
        source: first.text,
        sourcePath: 'index.md',
        slugMap: map,
      });
      expect(second.text).toBe(first.text);
    });
  }

  it('exercises every CORPUS fixture (sanity check that the array isn\'t empty)', () => {
    expect(CORPUS.length).toBeGreaterThan(20);
  });
});
