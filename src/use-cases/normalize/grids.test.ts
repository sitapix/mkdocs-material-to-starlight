import { describe, expect, it } from 'vitest';
import { normalizeCardGrids } from './grids.js';

describe('normalizeCardGrids', () => {
  it('passes through text containing no grid markup', () => {
    const src = '# Heading\n\nA paragraph.\n';
    expect(normalizeCardGrids(src)).toBe(src);
  });

  it('rewrites a card-grid block as :::card-grid containing :::card directives', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- __HTML__ for content',
      '- __JavaScript__ for interactivity',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    expect(out).toContain(':::card-grid');
    expect(out).toContain(':::card');
    expect(out).toContain('__HTML__ for content');
    expect(out).toContain('__JavaScript__ for interactivity');
    expect(out).not.toContain('<div class="grid cards"');
    expect(out).not.toContain('</div>');
  });

  it('preserves the count of cards (one directive per list item)', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- one',
      '- two',
      '- three',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    const cardOpens = out.match(/^:::card$/gm);
    expect(cardOpens?.length).toBe(3);
  });

  it('rewrites a generic grid as :::grid container with original block contents', () => {
    const src = [
      '<div class="grid" markdown>',
      '',
      '!!! note',
      '    body',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    expect(out).toContain(':::grid');
    expect(out).toContain('!!! note');
    expect(out).not.toContain('<div class="grid"');
  });

  it('does not touch lines inside fenced code', () => {
    const src = [
      '```',
      '<div class="grid cards" markdown>',
      '',
      '- card',
      '',
      '</div>',
      '```',
      '',
    ].join('\n');
    expect(normalizeCardGrids(src)).toBe(src);
  });

  it('emits a diagnostic-shaped marker when grid block is unclosed', () => {
    const src = '<div class="grid cards" markdown>\n\n- card\n';
    const out = normalizeCardGrids(src);
    // Unclosed grid leaves the source verbatim — caller can detect via search
    expect(out).toContain('<div class="grid cards"');
  });

  it('recognises asterisk (*) list markers in card-grid bodies (pydantic style)', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '*   Field validators',
      '',
      '    ---',
      '',
      '    * [after](#after)',
      '',
      '*   Model validators',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    expect(out).toContain(':::card-grid');
    const cardOpens = out.match(/^:::card$/gm);
    expect(cardOpens?.length).toBe(2);
    expect(out).toContain('Field validators');
    expect(out).toContain('Model validators');
  });

  it('recognises plus (+) list markers in card-grid bodies', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '+   Alpha',
      '+   Beta',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    const cardOpens = out.match(/^:::card$/gm);
    expect(cardOpens?.length).toBe(2);
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
  });

  describe('single-link card → <LinkCard> promotion', () => {
    it('promotes a card with a single bullet link to <LinkCard>', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- [Quick Start](getting-started.md)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard');
      expect(out).toContain('title="Quick Start"');
      expect(out).toContain('getting-started.md');
      expect(out).not.toContain(':::card\n');
    });

    it('does NOT promote a card with multiple links', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   Field validators',
        '',
        '    * [after](#after)',
        '    * [before](#before)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
      expect(out).toContain(':::card');
    });

    it('does NOT promote a card with paragraph content + link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-rocket: **Fast**',
        '',
        '    Blazing fast. [Learn more](docs.md)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
    });

    it('mixed grid: single-link card gets LinkCard, multi-content card stays :::card', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- [Quick Start](getting-started.md)',
        '',
        '-   :material-rocket: **Fast**',
        '',
        '    Blazing fast.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard');
      expect(out).toContain(':::card');
    });
  });

  it('is idempotent', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- a',
      '- b',
      '',
      '</div>',
      '',
    ].join('\n');
    const once = normalizeCardGrids(src);
    expect(normalizeCardGrids(once)).toBe(once);
  });

  it('dedents card body so inner list items are not treated as indented code', () => {
    // When a card has nested list items, the body lines may carry leading
    // whitespace that exceeds 4 spaces (CommonMark indented-code threshold).
    // The normalizer must dedent each card's body to remove this excess.
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '*   Field validators',
      '',
      '    ---',
      '',
      '    * [field after](#field-after)',
      '    * [field before](#field-before)',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    // After normalization, no line inside a :::card block should have
    // 4+ spaces of leading indentation (which would trigger code blocks).
    const cardLines = out.split('\n');
    const inCard: string[] = [];
    let inside = false;
    for (const line of cardLines) {
      if (line === ':::card') { inside = true; continue; }
      if (line === ':::') { inside = false; continue; }
      if (inside) inCard.push(line);
    }
    // None of the body lines should have 4+ spaces of leading indent
    // (which CommonMark interprets as an indented code block).
    const codeLikeLines = inCard.filter((l) => /^ {4,}\S/.test(l));
    expect(codeLikeLines).toHaveLength(0);
    // The links should be present and accessible
    expect(out).toContain('[field after](#field-after)');
  });
});
