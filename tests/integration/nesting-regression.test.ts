import { describe, expect, it } from 'vitest';
import { convertFile } from '../../src/use-cases/convert-file/convert.js';
import { buildSlugMap } from '../../src/domain/starlight/slug-map.js';

/**
 * Regression test for the colon-count nesting bug.
 *
 * `remark-directive` requires the *outer* container directive to use more
 * colons than its inner directives so the closing `:::` of the inner
 * doesn't accidentally close the outer. The pre-parse normalizers therefore
 * use 4-colon outer wrappers (`::::tabs`, `::::card-grid`, `::::grid`) and
 * 3-colon inner directives (`:::tab`, `:::card`).
 *
 * This test exists to catch a class of bug that unit-level "presence"
 * assertions miss: it asserts STRUCTURAL relationships — every inner
 * element appears between the outer wrapper's open and close tags, not
 * scattered as orphan siblings outside.
 */

function map(paths: ReadonlyArray<string>) {
  const result = buildSlugMap(paths);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function structuralCheck(text: string, openTag: string, closeMarker: string, items: ReadonlyArray<string>): void {
  const openIdx = text.indexOf(openTag);
  expect(openIdx).toBeGreaterThanOrEqual(0);
  const closeIdx = text.lastIndexOf(closeMarker);
  expect(closeIdx).toBeGreaterThan(openIdx);
  for (const item of items) {
    const itemIdx = text.indexOf(item);
    expect(itemIdx).toBeGreaterThan(openIdx);
    expect(itemIdx).toBeLessThan(closeIdx);
  }
}

describe('nesting structural regression', () => {
  it('all card grid items are nested INSIDE the grid wrapper', () => {
    const source = [
      '<div class="grid cards" markdown>',
      '',
      '- :material-rocket: __Speed__ — fast.',
      '- :material-cog: __Config__ — easy.',
      '- :material-star: __Stars__ — shiny.',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = convertFile({
      source,
      sourcePath: 'index.md',
      slugMap: map(['index.md']),
    });
    structuralCheck(out.text, '<div class="sl-card-grid">', '</div>', [
      '**Speed**',
      '**Config**',
      '**Stars**',
    ]);
  });

  it('all tabs are nested INSIDE the tabs wrapper', () => {
    const source = [
      '=== "macOS"',
      '    brew install foo',
      '',
      '=== "Linux"',
      '    apt install foo',
      '',
      '=== "Windows"',
      '    choco install foo',
      '',
    ].join('\n');
    const out = convertFile({
      source,
      sourcePath: 'index.md',
      slugMap: map(['index.md']),
    });
    structuralCheck(out.text, '<Tabs>', '</Tabs>', [
      'label="macOS"',
      'label="Linux"',
      'label="Windows"',
    ]);
  });

  it('two adjacent grid blocks each contain their own cards (no cross-contamination)', () => {
    const source = [
      '<div class="grid cards" markdown>',
      '',
      '- __First__ A1',
      '- __First__ A2',
      '',
      '</div>',
      '',
      '<div class="grid cards" markdown>',
      '',
      '- __Second__ B1',
      '- __Second__ B2',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = convertFile({
      source,
      sourcePath: 'index.md',
      slugMap: map(['index.md']),
    });
    const grids = out.text.match(/<div class="sl-card-grid">/g) ?? [];
    const cards = out.text.match(/<div class="sl-card">/g) ?? [];
    expect(grids.length).toBe(2);
    expect(cards.length).toBe(4);
  });

  it('a grid with a single nested admonition keeps the admonition inside the grid', () => {
    const source = [
      '<div class="grid" markdown>',
      '',
      '!!! note',
      '    Inside the grid.',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = convertFile({
      source,
      sourcePath: 'index.md',
      slugMap: map(['index.md']),
    });
    structuralCheck(out.text, '<div class="sl-grid">', '</div>', [':::note']);
  });
});
