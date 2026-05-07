/**
 * Generative property test for `convert(convert(x)) === convert(x)`.
 *
 * The static fixture corpus in `convert-file-idempotency.test.ts` enumerates
 * the constructs we already know break. fast-check explores the *space*: it
 * generates synthetic Markdown documents from a grammar of MkDocs Material
 * idioms, runs the converter twice, and asserts byte-equality. When a
 * counterexample is found, fast-check shrinks it to the minimum reproducer,
 * which surfaces interaction bugs the fixture corpus cannot.
 *
 * Generators are intentionally narrow: they cover the constructs whose
 * idempotency is most fragile (admonitions, content tabs, attr_list blobs,
 * inline marks, fenced code blocks). Wider grammars would explore CommonMark
 * surface that is the upstream parsers' responsibility, not ours.
 */

import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { buildSlugMap } from '../../src/domain/starlight/slug-map.js';
import { convertFile } from '../../src/use-cases/convert-file/convert.js';

const slugMap = (() => {
  const r = buildSlugMap(['index.md', 'guides/intro.md', 'api/auth.md']);
  if (!r.ok) {
    throw new Error(r.error.message);
  }
  return r.value;
})();

// Build a single string from a list of "block" parts joined by blank lines.
const blocks = (parts: ReadonlyArray<string>): string => `${parts.join('\n\n')}\n`;

// Heading text — printable ASCII with no Markdown-special characters that
// would derail emphasis/link parsing. Length-bounded so the corpus stays
// readable when shrunk.
const headingText = fc
  .stringMatching(/^[A-Za-z0-9 ,.\-_'"]{1,40}$/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const heading = fc
  .tuple(fc.integer({ min: 1, max: 4 }), headingText)
  .map(([level, text]) => `${'#'.repeat(level)} ${text}`);

const paragraph = headingText.map((s) => `${s}.`);

// Material legacy admonition: `!!! type "Title"\n    body\n`
const admonition = fc
  .tuple(
    fc.constantFrom('note', 'tip', 'warning', 'danger', 'info', 'caution'),
    headingText,
    headingText,
  )
  .map(([type, title, body]) => `!!! ${type} "${title}"\n    ${body}.`);

// Collapsible admonition: `??? note "Title"`
const collapsibleAdmonition = fc
  .tuple(fc.constantFrom('note', 'tip', 'warning'), headingText, headingText)
  .map(([type, title, body]) => `??? ${type} "${title}"\n    ${body}.`);

// Blocks-syntax admonition: `/// note | Title\nbody\n///\n`
const blocksAdmonition = fc
  .tuple(fc.constantFrom('note', 'tip', 'warning', 'details'), headingText, headingText)
  .map(([type, title, body]) => `/// ${type} | ${title}\n${body}.\n///`);

// Content tab group: 2-4 tabs with simple bodies
const contentTabs = fc
  .array(
    fc.tuple(headingText, headingText).map(([label, body]) => `=== "${label}"\n    ${body}.`),
    { minLength: 2, maxLength: 4 },
  )
  .map((tabs) => tabs.join('\n\n'));

// Fenced code block — language tag + body. The body is plain ASCII to avoid
// accidentally generating MDX-special syntax.
const codeBlock = fc
  .tuple(
    fc.constantFrom('python', 'ts', 'js', 'bash', ''),
    fc.stringMatching(/^[A-Za-z0-9 _=\n]{1,80}$/),
  )
  .map(([lang, body]) => `\`\`\`${lang}\n${body}\n\`\`\``);

// Inline mark — currently the converter rewrites ==text== to <mark>text</mark>;
// idempotency is the key invariant here.
const inlineMarks = headingText.map((s) => `Text with ==${s}== highlight.`);

// A union of every block type we want to fuzz. fast-check's oneof picks
// uniformly; the shrinker minimises within each generator.
const mkBlock = fc.oneof(
  heading,
  paragraph,
  admonition,
  collapsibleAdmonition,
  blocksAdmonition,
  contentTabs,
  codeBlock,
  inlineMarks,
);

// A document = 1-6 blocks. Larger corpora explode the test runtime; six is
// enough to find interaction bugs between adjacent constructs.
const mkDocument = fc.array(mkBlock, { minLength: 1, maxLength: 6 }).map(blocks);

function runOnce(source: string): string {
  return convertFile({
    source,
    sourcePath: 'index.md',
    slugMap,
  }).text;
}

describe('convertFile property — idempotency under generated MkDocs Markdown', () => {
  test.prop([mkDocument], { numRuns: 200 })(
    'convert(convert(x)) === convert(x) for synthetic Markdown',
    (source) => {
      const once = runOnce(source);
      const twice = runOnce(once);
      expect(twice).toBe(once);
    },
  );

  test.prop([mkDocument], { numRuns: 200 })(
    'convertFile never throws on generated Markdown',
    (source) => {
      // Throwing is reserved for unrecoverable conditions; a generated
      // document with arbitrary admonition / tab / code-block combinations
      // must not abort the per-file pipeline.
      expect(() => runOnce(source)).not.toThrow();
    },
  );
});
