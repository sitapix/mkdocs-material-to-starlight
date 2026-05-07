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
    const src = ['<div class="grid" markdown>', '', '!!! note', '    body', '', '</div>', ''].join(
      '\n',
    );
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
      expect(out).toContain('description="Learn how to make your Starlight site your own."');
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
      expect(out).toContain('description="First line of description. Second line of description."');
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
      expect(out).toContain('description="Reads &quot;config.yml&quot; on startup."');
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
    const src = ['<div class="grid cards" markdown>', '', '- a', '- b', '', '</div>', ''].join(
      '\n',
    );
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
      if (line === ':::card') {
        inside = true;
        continue;
      }
      if (line === ':::') {
        inside = false;
        continue;
      }
      if (inside) inCard.push(line);
    }
    // None of the body lines should have 4+ spaces of leading indent
    // (which CommonMark interprets as an indented code block).
    const codeLikeLines = inCard.filter((l) => /^ {4,}\S/.test(l));
    expect(codeLikeLines).toHaveLength(0);
    // The links should be present and accessible
    expect(out).toContain('[field after](#field-after)');
  });

  it('inserts a blank line before `::::card-grid` when emitted inside an outer HTML wrapper', () => {
    // Real mkdocs-material regression: `reference/grids.md` nests
    // `<div class="grid cards" markdown>` inside `<div class="result" markdown>`.
    // CommonMark HTML blocks consume every non-blank line as raw HTML, so
    // without a blank-line separator the converted `::::card-grid` directive
    // and its `:::card` children are absorbed into the outer div's text and
    // never parsed as directives — leaving icon shortcodes and directive
    // markers as visible literal text.
    const src = [
      '<div class="result" markdown>',
      '  <div class="grid cards" markdown>',
      '',
      '- :material-html5: HTML',
      '- :material-css3: CSS',
      '',
      '  </div>',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    // The output must have a blank line between the outer `<div ...>` and
    // the converted `::::card-grid` opener so the HTML block ends before
    // the directive starts.
    expect(out).toMatch(/<div class="result" markdown>\n\n/);
    // And a blank line after the directive closer before the next non-blank
    // (the outer `</div>` here was preceded by a blank in the source, so
    // we don't double-blank — the existing blank suffices).
    expect(out).toContain('::::card-grid');
  });

  it('dedents Material-style cards where title is column-0 and body is column-4', () => {
    // Real-world: PowerTools `index.md` writes
    //   - :icon:{ .lg } __Support this project__
    //
    //       ---
    //       Become a public reference, share your work...
    //       [:octicons-arrow-right-24: Support](#support-...)
    // After stripping `- `, the title sits at column 0 while the body
    // lines retain 4 spaces of indent. A naive min-indent dedent computes
    // `minIndent = 0` because of the title and leaves the body alone —
    // CommonMark then treats the 4-space-indented body as an indented
    // code block, and the rendered card body shows up as code.
    // The mixed-indent case must dedent body lines to align with the title.
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- :heart:{ .lg .middle } __Support this project__',
      '',
      '    ---',
      '',
      '    Become a public reference, share your work, join the community.',
      '',
      '    [:octicons-arrow-right-24: Support](#support)',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    // No body line should retain 4-space indent (which would code-fence it).
    const cardLines = out.split('\n');
    const inCard: string[] = [];
    let inside = false;
    for (const line of cardLines) {
      if (line === ':::card') {
        inside = true;
        continue;
      }
      if (line === ':::') {
        inside = false;
        continue;
      }
      if (inside) inCard.push(line);
    }
    const codeLikeLines = inCard.filter((l) => /^ {4,}\S/.test(l));
    expect(codeLikeLines).toHaveLength(0);
    // The body content reaches the output verbatim.
    expect(out).toContain('Become a public reference');
    expect(out).toContain('[:octicons-arrow-right-24: Support](#support)');
  });

  describe('dedent robustness — false-positive guards', () => {
    it('preserves nested list structure when body has mixed indents', () => {
      // Title at 0, intro at 4, nested list at 4, deeply-nested at 8.
      // After dedent the *relative* structure must survive: intro and the
      // nested list bullets at 0; the deep nested item at 4.
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- __Title__',
        '',
        '    Intro paragraph.',
        '',
        '    - First subitem',
        '        - Deeply nested',
        '    - Second subitem',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      // Intro and the top-level subitems sit at column 0, the deep one at 4.
      expect(out).toContain('\nIntro paragraph.\n');
      expect(out).toContain('\n- First subitem\n');
      expect(out).toContain('\n    - Deeply nested\n');
      expect(out).toContain('\n- Second subitem\n');
    });

    it('does not destroy a fenced code block inside the card body', () => {
      // The fence opener was indented to fit under the list marker. After
      // dedent the fence must end at column 0 so it is still a fenced
      // code block (not an indented one) and the body inside it is intact.
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- __Title__',
        '',
        '    ```python',
        '    print("hello")',
        '    ```',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('```python');
      expect(out).toContain('print("hello")');
      // No 4-space-indented content survives inside the card.
      const cardBody = extractCardBodies(out);
      const codeLikeLines = cardBody.filter((l) => /^ {4,}\S/.test(l));
      expect(codeLikeLines).toHaveLength(0);
    });

    it('leaves a card alone whose title and body all share an indent (uniform-indent path)', () => {
      // Both the title (after marker strip) and body sit at column 2
      // because the whole grid is itself nested inside another container.
      // The min-indent path handles this without our zero-count heuristic.
      const src = [
        '  <div class="grid cards" markdown>',
        '',
        '  - __Title__',
        '',
        '      Body line',
        '',
        '  </div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      // Body should not have 4+ leading spaces inside the rendered card.
      const cardBody = extractCardBodies(out);
      const codeLikeLines = cardBody.filter((l) => /^ {4,}\S/.test(l));
      expect(codeLikeLines).toHaveLength(0);
    });

    it('leaves a single-line card (title only, no body) untouched', () => {
      // Boundary: only one non-blank line. Dedent is a no-op — no body to
      // shift. The title itself must still be present.
      const src = [
        '<div class="grid cards" markdown>',
        '',
        '- __Just a Title__',
        '',
        '</div>',
        '',
      ].join('\n');
      const out = normalizeCardGrids(src);
      expect(out).toContain('__Just a Title__');
    });
  });
});

function extractCardBodies(out: string): string[] {
  const cardLines = out.split('\n');
  const inCard: string[] = [];
  let inside = false;
  for (const line of cardLines) {
    if (line.trim() === ':::card') {
      inside = true;
      continue;
    }
    if (inside && line.trim() === ':::') {
      inside = false;
      continue;
    }
    if (inside) inCard.push(line);
  }
  return inCard;
}
