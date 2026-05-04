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

  describe('link + description card → <LinkCard description=…> promotion', () => {
    it('promotes a card with a bare link followed by a single plain paragraph', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Customizing Starlight](/guides/customization/)',
        '',
        '    Learn how to make your Starlight site your own.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard');
      expect(out).toContain('title="Customizing Starlight"');
      expect(out).toContain('href="/guides/customization/"');
      expect(out).toContain(
        'description="Learn how to make your Starlight site your own."',
      );
      expect(out).not.toMatch(/^:::card$/m);
    });

    it('joins a multi-line plain paragraph into a single description', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Title](href.md)',
        '',
        '    First line of description.',
        '    Second line of description.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain(
        'description="First line of description. Second line of description."',
      );
    });

    it('escapes quote characters in the description', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Title](href.md)',
        '',
        '    Reads "config.yml" on startup.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain(
        'description="Reads &quot;config.yml&quot; on startup."',
      );
    });

    it('does NOT promote when the description paragraph contains a markdown link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Title](href.md)',
        '',
        '    See also [other page](other.md) for context.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
      expect(out).toContain(':::card');
    });

    it('does NOT promote when the description contains inline code', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Title](href.md)',
        '',
        '    Configures the `database.url` setting.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
    });

    it('does NOT promote when there are two paragraphs after the link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Title](href.md)',
        '',
        '    First paragraph.',
        '',
        '    Second paragraph.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
      expect(out).toContain(':::card');
    });

    it('does NOT promote when description contains block-level markdown', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Title](href.md)',
        '',
        '    - bullet inside description',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
    });

    it('still promotes the bare-link-only shape (no regression)', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- [Quick Start](getting-started.md)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Quick Start" href="getting-started.md" />');
      expect(out).not.toContain('description=');
    });

    it('is idempotent across both shapes in the same grid', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- [Plain Link](a.md)',
        '',
        '-   [Linked Title](b.md)',
        '',
        '    Description text.',
        '',
        '</div>',
        '',
      ].join('\n');
      const once = normalizeCardGrids(src);
      expect(normalizeCardGrids(once)).toBe(once);
    });
  });

  describe('icon and emphasis wrappers around the link', () => {
    it('strips a Material icon prefix before matching the link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-clock: [Quick Start](getting-started.md)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Quick Start" href="getting-started.md" />');
    });

    it('strips a trailing Material icon (arrow-right idiom)', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   [Quick Start](getting-started.md) :material-arrow-right:',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Quick Start" href="getting-started.md" />');
    });

    it('strips a surrounding **bold** wrapper before matching the link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- **[Quick Start](getting-started.md)**',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Quick Start" href="getting-started.md" />');
    });

    it('strips a surrounding __bold__ wrapper before matching the link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- __[Quick Start](getting-started.md)__',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Quick Start" href="getting-started.md" />');
    });

    it('strips a surrounding *italic* wrapper before matching the link', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- *[Quick Start](getting-started.md)*',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Quick Start" href="getting-started.md" />');
    });

    it('strips combined icon prefix + bold wrapper (canonical Material idiom)', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-clock: __[Customizing Starlight](/guides/customization/)__',
        '',
        '    Learn how to make your Starlight site your own.',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard');
      expect(out).toContain('title="Customizing Starlight"');
      expect(out).toContain('href="/guides/customization/"');
      expect(out).toContain('description="Learn how to make your Starlight site your own."');
    });

    it('handles fontawesome and octicons icon namespaces', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- :fontawesome-solid-rocket: **[Launch](launch.md)**',
        '- :octicons-mark-github-16: [Repo](https://github.com/x/y)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('<LinkCard title="Launch"');
      expect(out).toContain('<LinkCard title="Repo"');
    });

    it('does NOT promote when there is extra text after the link on the same line', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-clock: [Title](href.md) — with extra trailing prose',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
      expect(out).toContain(':::card');
    });

    it('does NOT promote when an icon-only line precedes the link (no link on first non-blank line)', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-rocket: **Fast**',
        '',
        '    [Learn more](docs.md)',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).not.toContain('<LinkCard');
    });

    it('is idempotent for icon-prefixed link cards with description', () => {
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '-   :material-clock: __[Customizing Starlight](/guides/customization/)__',
        '',
        '    Learn how to make your Starlight site your own.',
        '',
        '</div>',
        '',
      ].join('\n');
      const once = normalizeCardGrids(src);
      expect(normalizeCardGrids(once)).toBe(once);
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
