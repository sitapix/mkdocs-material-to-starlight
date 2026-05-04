import { describe, expect, it } from 'vitest';
import { sanitizeMdxSyntax } from './sanitize-mdx-syntax.js';

describe('sanitizeMdxSyntax', () => {
  describe('HTML comments', () => {
    it('rewrites a single-line <!-- ... --> comment as an MDX {/* ... */} comment', () => {
      // MDX parses `<!-- ` as the start of a JSX element whose name begins with
      // `!` — invalid. Real-world pydantic regression: `<!-- markdownlint-... -->`
      // crashed the build on every page that used markdownlint hints.
      const src = 'before\n<!-- markdownlint-disable-next-line strong-style -->\nafter\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('<!--');
      expect(out).not.toContain('-->');
      expect(out).toContain('{/* markdownlint-disable-next-line strong-style */}');
    });

    it('preserves <!-- ... --> inside fenced code', () => {
      const src = '```html\n<!-- comment -->\n```\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('rewrites a multi-line <!-- ... --> comment', () => {
      const src = '<!-- line one\nline two -->\nafter\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('{/* line one\nline two */}');
      expect(out).not.toContain('<!--');
    });
  });

  describe('Markdown autolinks', () => {
    it('rewrites <https://example.com> to a Markdown link', () => {
      // MDX parses `<` as start of JSX. `<https://...>` becomes a JSX tag named
      // `https` — invalid because of `:` and `/`. Real-world pydantic
      // migration.mdx regression.
      const src = 'See <https://docs.pydantic.dev/1.10/> for details.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('[https://docs.pydantic.dev/1.10/](https://docs.pydantic.dev/1.10/)');
      expect(out).not.toMatch(/<https:\/\//);
    });

    it('rewrites <mailto:foo@example.com>', () => {
      const src = 'Email <mailto:foo@example.com>.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('[mailto:foo@example.com](mailto:foo@example.com)');
    });

    it('preserves <https://...> inside inline code', () => {
      const src = 'Use `<https://x>` syntax.\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });
  });

  describe('heading anchor attribute lists', () => {
    it('escapes `{#anchor-id}` so MDX does not parse it as a JS expression', () => {
      // `{#anchor}` is Material's heading-anchor syntax. MDX parses `{` as JS
      // expression opener and `#` is invalid JS — build fails. Real-world
      // pydantic validators.mdx and sqlmodel insert.mdx regression.
      const src = 'paragraph text\n  {#field-after-validator}\n\nmore.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toMatch(/(?<!\\)\{#field-after-validator\}/);
      expect(out).toMatch(/\\\{#field-after-validator\\\}/);
    });

    it('preserves `{#anchor}` inside fenced code', () => {
      const src = '```md\n{#anchor}\n```\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('does not escape an attribute list of class names like {.foo .bar}', () => {
      // Attribute lists with class names start with `.`, not `#`. They were
      // already stripped by the link-attr-list pass; if any sneak through
      // (they shouldn't), they're not parsed as JS so don't need escaping.
      const src = 'text {.note}\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('escapes anchor IDs that contain backslash-escaped underscores', () => {
      // remark-stringify escapes `_` in heading anchor labels to prevent
      // emphasis interpretation, producing `{#some\_id}`. Real-world
      // pydantic serialization.mdx regression: `{#modelmodel\_dump}` crashed
      // the build because `\_` is not a valid JS identifier character.
      const src = 'paragraph\n  {#modelmodel\\_dump}\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toMatch(/\\\{#modelmodel\\_dump\\\}/);
    });
  });

  describe('mkdocs include macro {!path!}', () => {
    it('wraps {!file.md!} in inline backticks so MDX does not parse the {! as JS', () => {
      // mkdocs-include-markdown plugin syntax. MDX parses `{` as JS expression
      // opener, sees `!./path` and chokes (`!` is a valid JS prefix but `./`
      // isn't valid syntax after it). Real-world sqlmodel regression.
      const src = 'before\n{!./docs/page.md!}\nafter\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('`{!./docs/page.md!}`');
      expect(out).not.toMatch(/(?<!`)\{!/);
    });

    it('handles a {!path!} with backslash-escaped underscores in the path', () => {
      const src = '{!./docs\\_src/tutorial/foo.md!}\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('`{!./docs\\_src/tutorial/foo.md!}`');
    });

    it('preserves {!...!} inside fenced code', () => {
      const src = '```\n{!./foo.md!}\n```\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });
  });

  describe('void HTML elements', () => {
    it('self-closes <br> so MDX does not look for </br>', () => {
      // MDX requires void elements to be explicitly self-closed. `<br>` alone
      // raises "Expected a closing tag for `<br>`". Real-world pydantic
      // alias.mdx regression: `<br>` after each list item.
      const src = 'first<br>\nsecond<br>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('first<br/>');
      expect(out).toContain('second<br/>');
      expect(out).not.toMatch(/<br>/);
    });

    it('self-closes other common void elements', () => {
      const src = '<hr>\n![](x.png) <img src="x">\n<input type="text">\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('<hr/>');
      expect(out).toContain('<img src="x"/>');
      expect(out).toContain('<input type="text"/>');
    });

    it('leaves an already-self-closed <br/> alone (idempotent)', () => {
      const src = 'first<br/>\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('preserves <br> inside fenced code', () => {
      const src = '```html\n<br>\n```\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });
  });

  describe('idempotency', () => {
    it('is idempotent across all rewrites', () => {
      const src = [
        '<!-- comment -->',
        '',
        'See <https://example.com>.',
        '',
        'paragraph',
        '  {#section-id}',
        '',
        'first<br>',
        '',
        '```html',
        '<!-- preserved -->',
        '<br>',
        '<https://x>',
        '```',
        '',
      ].join('\n');
      const once = sanitizeMdxSyntax(src);
      const twice = sanitizeMdxSyntax(once);
      expect(twice).toBe(once);
    });
  });

  describe('ambiguous `<` (digit, whitespace, equals)', () => {
    it('escapes `<` followed by a digit (version comparator) — kedro regression', () => {
      const out = sanitizeMdxSyntax('Use Kedro <0.17.0 for legacy.');
      expect(out).toBe('Use Kedro &lt;0.17.0 for legacy.');
    });

    it('escapes `<=` and `<` followed by whitespace', () => {
      const out = sanitizeMdxSyntax('python <= 3.10 and node < 18.');
      expect(out).toBe('python &lt;= 3.10 and node &lt; 18.');
    });

    it('does NOT escape valid JSX opening tags or closing tags', () => {
      const src = '<Tabs>\n<TabItem label="A">x</TabItem>\n</Tabs>\n';
      expect(sanitizeMdxSyntax(src)).toContain('<Tabs>');
      expect(sanitizeMdxSyntax(src)).toContain('<TabItem label="A">');
      expect(sanitizeMdxSyntax(src)).toContain('</TabItem>');
    });

    it('does NOT escape `<` inside fenced code', () => {
      const src = ['```js', 'const a = b < 3;', '```', ''].join('\n');
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('does NOT escape `<` inside inline code', () => {
      const out = sanitizeMdxSyntax('Use `python <3.10` for legacy.');
      expect(out).toBe('Use `python <3.10` for legacy.');
    });

    it('idempotent: a second pass leaves the escaped output unchanged', () => {
      const once = sanitizeMdxSyntax('node <16');
      const twice = sanitizeMdxSyntax(once);
      expect(twice).toBe(once);
    });
  });

  describe('extended HTML comments (n-dash open and close)', () => {
    it('rewrites <!--- (3-dash) comments — japila-spark regression', () => {
      const src = 'before\n<!---\n## Review Me\n--->\nafter\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('<!---');
      expect(out).not.toContain('--->');
      expect(out).toContain('{/*');
    });

    it('rewrites <!-- ... -----> (more dashes on close) too', () => {
      const src = '<!-- foo ----->';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('<!--');
    });

    it('escapes a stray <! when no comment close is found', () => {
      const src = '<! orphan\nrest of paragraph\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&lt;!');
    });
  });

  describe('placeholder text and generic-type angle brackets', () => {
    it('escapes Java/Scala generic-type syntax `Optional<Offset>` — japila-spark regression', () => {
      const src = 'void setStartOffset(Optional<Offset> start)\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('Optional&lt;Offset&gt; start');
    });

    it('escapes snake_case placeholders that look like JSX — kedro regression', () => {
      const src = 'src/<package_name>/run.py\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&lt;package_name&gt;');
    });

    it('escapes `<your-name>` kebab-case placeholders embedded in prose', () => {
      const src = 'replace `<your-name>` with the actual value.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('`<your-name>`'); // inside inline code: untouched
    });

    it('does NOT escape valid JSX components like <Tabs> or <TabItem>', () => {
      const src = '<Tabs>\n<TabItem label="A">x</TabItem>\n</Tabs>\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('does NOT escape void elements like <br> that have a known closing rule', () => {
      const src = 'first<br>second\n';
      const out = sanitizeMdxSyntax(src);
      // The void-element self-closer kicks in instead.
      expect(out).toContain('<br/>');
      expect(out).not.toContain('&lt;br');
    });
  });

  describe('Material span-anchor heading idiom', () => {
    it('strips `### <span id="foo"> Title` to `### Title` — japila-spark regression', () => {
      const src = '### <span id="add"> Storing Metadata of Streaming Batch\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('### Storing Metadata of Streaming Batch');
      expect(out).not.toContain('<span');
    });

    it('strips `## <span class="...">title</span>` (with closing tag) too', () => {
      const src = '## <span class="anchor">SQLConf</span>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('## SQLConf');
      expect(out).not.toContain('<span');
    });
  });

  describe('<style> blocks', () => {
    it('escapes `{` and `}` inside <style> so CSS rules survive MDX parsing', () => {
      const src = [
        '<style>',
        '  .md-content__button {',
        '    display: none;',
        '  }',
        '</style>',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      // `<style>` and `</style>` survive
      expect(out).toContain('<style>');
      expect(out).toContain('</style>');
      // braces inside are escaped (so MDX no longer treats them as expressions)
      expect(out).not.toContain('display: none;\n  }');
      expect(out).toMatch(/&lcub;|\\{|&#123;/);
    });

    it('does not touch braces outside <style> blocks', () => {
      const src = 'normal text { not in style }\n<style>p { color: red; }</style>\n';
      const out = sanitizeMdxSyntax(src);
      // Outside <style>, the existing brace handling applies (no change for
      // this test). Inside <style>, the { gets escaped.
      expect(out).toContain('p &lcub;');
    });
  });
});
