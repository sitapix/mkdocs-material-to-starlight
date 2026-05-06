import { describe, expect, it } from 'vitest';
import { sanitizeMdxSyntax, type SanitizeReport } from './sanitize-mdx-syntax.js';

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

    it('rewrites a bare email autolink <foo@example.com> to a mailto link', () => {
      // CommonMark recognises <email@host> with no scheme as an email autolink
      // and renders it as a mailto link. MDX parses the `<` as a JSX tag opener
      // and chokes on the `@`. Real regression: zbghost325/XRIML-WIKI's
      // how-to-edit.md ends with `<camdimmersivemedialab@northeastern.edu>`.
      const src = 'Or contact: **<foo@example.com>**\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('[foo@example.com](mailto:foo@example.com)');
      expect(out).not.toMatch(/<foo@/);
    });

    it('rewrites a real-world hyphenated email autolink', () => {
      const src = 'Or contact: <camdimmersivemedialab@northeastern.edu>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('[camdimmersivemedialab@northeastern.edu](mailto:camdimmersivemedialab@northeastern.edu)');
    });

    it('does not treat <not-an-email> as an email autolink', () => {
      // No `@` → not an email autolink; this case falls to other handlers
      // (kebab-case placeholder escaping) and must NOT be wrapped as mailto.
      const src = 'Replace <not-an-email> with your name.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('mailto:');
    });

    it('does not treat <with whitespace@host> as an email autolink', () => {
      // Whitespace anywhere disqualifies an autolink per CommonMark.
      const src = 'Bad: <with whitespace@host>.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('mailto:with');
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

    it('strips an inline `{.classname}` attribute list (was: not escaped)', () => {
      // The original premise was wrong — `{.note}` IS parsed by MDX as a JS
      // expression, and `.note` is not valid JavaScript at expression start.
      // The inline-attr-list stripper now removes any `{...}` whose tokens
      // are all attr-list shape and at least one is a class or `key=value`.
      const src = 'text {.note}\n';
      expect(sanitizeMdxSyntax(src)).toBe('text \n');
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

    it('escapes bare lowercase placeholder words like `<port>` in prose', () => {
      // Real-world (threatexpert/gonc/guide/modules.md): the Chinese prose
      // mentions `指定本地监听 <port>` — `<port>` is a placeholder, not a
      // real HTML element and has no closing tag. After MDX promotion via
      // a sibling content-tabs block, the literal `<port>` makes the MDX
      // parser raise "Expected a closing tag for `<port>`".
      const src = '指定本地监听 <port> 作为入口。\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&lt;port&gt;');
      expect(out).not.toContain('<port>');
    });

    it('does NOT escape real HTML elements like <p>, <div>, <span> when bare in prose', () => {
      // Lowercase placeholders only get escaped when the word is NOT in
      // the known-HTML-element set. `<div>foo</div>` is real HTML.
      const src = '<div>content</div>\n<p>para</p>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('<div>');
      expect(out).toContain('<p>');
    });

    it('escapes orphan-paired self-closing tags like Apache `<Location />…</Location>`', () => {
      // Real-world (Colm3na/DocsColmena/ghost.md) inside an Apache vhost
      // config block: `<Location />` is Apache notation for the URI `/`,
      // not a JSX self-close. It's followed by `</Location>` — a pattern
      // that JSX rejects ("Unexpected closing tag, expected corresponding
      // closing tag for <pre>"). When a self-closing-shaped tag has a
      // matching closer later AND no real (non-self-close) opener between
      // them, escape both.
      const src = '<Location />\n  body\n</Location>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&lt;Location /&gt;');
      expect(out).toContain('&lt;/Location&gt;');
    });

    it('escapes Apache-style config tags whose body has JSX-incompatible attributes', () => {
      // Real-world (Colm3na/DocsColmena/ghost.md): the docs include an
      // Apache vhost config block in prose (not fenced). `<VirtualHost *:443>`,
      // `<IfModule mod_ssl.c>`, `<Proxy *>` etc. have attribute bodies
      // (`*:443`, `mod_ssl.c`, `*`) that look like JSX-component openers
      // but contain characters JSX rejects in attribute-name position
      // (`*`, `:`, `.`). Without escaping, MDX raises
      // "Unexpected character `.` (U+002E) in attribute name".
      const src = '<VirtualHost *:443>\n  <IfModule mod_ssl.c>\n    body\n  </IfModule>\n</VirtualHost>\n';
      const out = sanitizeMdxSyntax(src);
      // Brackets escaped on the openers AND matching closers — otherwise
      // MDX would still error on the orphan `</IfModule>` / `</VirtualHost>`
      // ("Unexpected closing slash `/` in tag, expected open tag first").
      expect(out).toContain('&lt;VirtualHost *:443&gt;');
      expect(out).toContain('&lt;IfModule mod_ssl.c&gt;');
      expect(out).toContain('&lt;/IfModule&gt;');
      expect(out).toContain('&lt;/VirtualHost&gt;');
    });

    it('does NOT escape real JSX components with valid attribute syntax', () => {
      // `<MyTag prop="value">…</MyTag>` is real JSX and must pass through.
      const src = '<MyTag prop="value">content</MyTag>\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });
  });

  describe('Material span-anchor heading idiom', () => {
    it('strips a mid-line `</span>` closer when its opener was stripped', () => {
      // Real-world (jujimeizuo/note/cs/others/regex.md): a bullet item
      // wraps a regex sample in a `<span style="...">…</span>` for ligature
      // disabling — `- <span style="…">(?<=pattern)</span>：匹配前面…`.
      // Stripping only end-of-line closers left the orphan `</span>`
      // mid-line; MDX raised "Unexpected closing slash `/`".
      const src = '- <span style="font-variant-ligatures: none;">(?<=pattern)</span>：匹配前面\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('<span');
      expect(out).not.toContain('</span>');
      expect(out).toContain('匹配前面');
    });

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

  describe('bare PyMdown attr_list lines (block-level)', () => {
    // PyMdown's `attr_list` extension lets users decorate the previous block
    // with `{ .class #id key=val }` on its own line. The Markdown renderer
    // attaches those as HTML attributes on the rendered element. Starlight
    // has no equivalent post-MDX hook, and MDX itself parses the bare `{...}`
    // as a JS expression — which fails when the contents are CSS-like
    // (`.card`, `#id style="..."`) rather than valid JavaScript.
    //
    // Strategy: silently drop the line. The previous block renders without
    // the decoration; users who relied on classes can re-add them as JSX
    // props after migration.

    it('strips a bare `{ .card }` line', () => {
      const src = 'A paragraph.\n{ .card }\n\nNext paragraph.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('{ .card }');
      expect(out).toContain('A paragraph.');
      expect(out).toContain('Next paragraph.');
    });

    it('strips a bare `{ #id key="val" }` line', () => {
      const src = '&nbsp;\n{ #feedback style="margin: 0; height: 0" }\n\nNext.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('{ #feedback');
      expect(out).toContain('Next.');
    });

    it('strips a bare attr-list line indented inside a list item', () => {
      // Material's nested-annotations example puts `{ .annotate ... }` under
      // a list item, indented four spaces.
      const src = [
        '1. First item',
        '    { .annotate style="margin-bottom: 0" }',
        '',
        '    1. nested',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('.annotate');
      expect(out).toContain('1. First item');
      expect(out).toContain('1. nested');
    });

    it('preserves `{ .class }` inside fenced code', () => {
      const src = '```markdown\n{ .card }\n```\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('does not strip lines with non-attr-list `{...}` content', () => {
      // A line that genuinely uses JSX expression syntax is not an attr-list.
      const src = 'count: {someVar}\n';
      expect(sanitizeMdxSyntax(src)).toContain('{someVar}');
    });

    it('is idempotent: stripped output re-runs to itself', () => {
      const src = 'Para.\n{ .card }\n\nMore.\n';
      const once = sanitizeMdxSyntax(src);
      const twice = sanitizeMdxSyntax(once);
      expect(twice).toBe(once);
    });
  });

  describe('HTML comments containing `*/`', () => {
    // Real-world mkdocs-material regression: the blog plugin docs contain
    // `<!-- md:default <code>{/* more */}</code> -->`. Naively wrapping the
    // body in `{/* ... */}` produces `{/* md:default <code>{/* more */}</code> */}`,
    // which has a premature `*/` (after `more `) that closes the JSX comment
    // early — the rest of the line becomes garbled JSX.

    it('rewrites a comment whose body contains a literal `*/` without breaking MDX', () => {
      const src = '<!-- md:default <code>{/* more */}</code> -->\n';
      const out = sanitizeMdxSyntax(src);
      // Output must be a single JSX comment block — no stray `*/` outside it.
      expect(out).not.toContain('<!--');
      expect(out).not.toContain('-->');
      expect(out.startsWith('{/*')).toBe(true);
      // The body's `*/` must be neutralized so the comment doesn't close early.
      // We accept any escape that breaks the literal `*/` sequence.
      const body = out.slice(3, out.lastIndexOf('*/'));
      expect(body).not.toMatch(/\*\//);
    });

    it('is idempotent for a comment with `*/` in its body', () => {
      const src = '<!-- a */ b -->\n';
      const once = sanitizeMdxSyntax(src);
      const twice = sanitizeMdxSyntax(once);
      expect(twice).toBe(once);
    });

    it('handles cross-pollination: outer raw <!-- ... --> with inner &lt;!-- ... --&gt;', () => {
      // Real-world mkdocs-material regression (`plugins/blog.md` at line 571):
      //   <!-- md:default <code>&lt;!-- more --&gt;</code> -->
      // The escaped-comment pass rewrites the inner `&lt;!-- more --&gt;` to
      // `{/* more */}`, which ends up *inside* the outer comment's body. If
      // the outer pass doesn't neutralize the resulting `*/`, the wrapped
      // `{/* outer ... {/* inner */} ... */}` closes early and the rest is
      // broken JSX.
      const src = '<!-- md:default <code>&lt;!-- more --&gt;</code> -->\n';
      const out = sanitizeMdxSyntax(src);
      expect(out.startsWith('{/*')).toBe(true);
      const innerBody = out.slice(3, out.lastIndexOf('*/'));
      expect(innerBody).not.toMatch(/\*\//);
    });
  });

  describe('inline PyMdown attr_list `{ .class }` strips after icons / shortcodes', () => {
    // PyMdown lets users append `{ .class #id key=val }` inline to *any*
    // element — links, images, icons, even bare text. Our `link-attr-list`
    // normalizer covers the link case at AST level. The remaining inline
    // shapes survive into MDX text and crash acorn (`.class` is not valid
    // JS, `#id` is not valid JS at expression start).
    //
    // Real-world regression: mkdocs-material `reference/grids.md`:
    //   :material-clock-fast:{ .lg .middle } __Set up in 5 minutes__

    it('strips an inline attr-list following a `:icon-shortcode:`', () => {
      const src = ':material-clock-fast:{ .lg .middle } **bold**\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('{ .lg .middle }');
      expect(out).toContain(':material-clock-fast:');
      expect(out).toContain('**bold**');
    });

    it('strips an inline attr-list with mixed tokens', () => {
      const src = 'before {#id .cls key="v"} after\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).not.toContain('{#id .cls key="v"}');
      expect(out).toContain('before');
      expect(out).toContain('after');
    });

    it('does NOT strip a real JSX expression like `{user.name}`', () => {
      const src = 'Hello {user.name}!\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('does NOT strip a numeric expression like `{0}`', () => {
      const src = 'count: {0}\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });

    it('preserves inline `{ .class }` inside fenced code', () => {
      const src = '```md\nicon{ .lg }\n```\n';
      expect(sanitizeMdxSyntax(src)).toBe(src);
    });
  });

  describe('strip report (optional collector)', () => {
    it('captures bare attr-list strips with line numbers', () => {
      const src = 'A\n{ .card }\n\nB\n{ #x style="margin:0" }\n';
      const report = { bareAttrLines: [], inlineAttrLists: [], spanAnchorsStripped: [] };
      sanitizeMdxSyntax(src, report);
      expect(report.bareAttrLines).toEqual([
        { line: 2, content: '{ .card }' },
        { line: 5, content: '{ #x style="margin:0" }' },
      ]);
      expect(report.inlineAttrLists).toEqual([]);
    });

    it('captures inline attr-list strips with line and column', () => {
      const src = 'before {.cls}\n:icon[x]{ .lg .middle } more\n';
      const report = { bareAttrLines: [], inlineAttrLists: [], spanAnchorsStripped: [] };
      sanitizeMdxSyntax(src, report);
      expect(report.inlineAttrLists).toHaveLength(2);
      expect(report.inlineAttrLists[0]).toMatchObject({
        line: 1,
        column: 8,
        content: '{.cls}',
      });
      expect(report.inlineAttrLists[1]).toMatchObject({
        line: 2,
        content: '{ .lg .middle }',
      });
    });

    it('does not populate the collector for non-attr-list `{...}`', () => {
      const src = 'Hello {user.name}!\nValue {0}\n';
      const report = { bareAttrLines: [], inlineAttrLists: [], spanAnchorsStripped: [] };
      sanitizeMdxSyntax(src, report);
      expect(report.bareAttrLines).toEqual([]);
      expect(report.inlineAttrLists).toEqual([]);
    });

    it('still works when called without a collector (existing signature)', () => {
      const src = 'A\n{ .card }\n\nB\n';
      expect(() => sanitizeMdxSyntax(src)).not.toThrow();
    });

    it('captures stripped <span id="..."> wrappers from headings', () => {
      // Material's `### <span id="anchor"> Title` idiom: the span is a manual
      // anchor that Starlight derives differently. Stripping silently loses
      // the cross-page anchor target — users with `[link](page.md#anchor)`
      // get broken links unless we tell them which IDs disappeared.
      const src = '### <span id="my-anchor"> My title\n\nbody\n';
      const report = {
        bareAttrLines: [],
        inlineAttrLists: [],
        spanAnchorsStripped: [],
      };
      sanitizeMdxSyntax(src, report);
      expect(report.spanAnchorsStripped).toHaveLength(1);
      expect(report.spanAnchorsStripped[0]).toMatchObject({
        line: 1,
        anchorId: 'my-anchor',
      });
    });

    it('captures multiple stacked <span id="..."> wrappers', () => {
      const src = '## <span id="alpha"><span id="beta"> Heading\n';
      const report: SanitizeReport = {
        bareAttrLines: [],
        inlineAttrLists: [],
        spanAnchorsStripped: [],
      };
      sanitizeMdxSyntax(src, report);
      // Each id is reported separately so the user sees every dropped anchor.
      expect(report.spanAnchorsStripped.map((s) => s.anchorId)).toEqual(['alpha', 'beta']);
    });

    it('strips bold-adjacent PyMdown explicit attr_list with leading colon (`{:`)', () => {
      // Real GitLab gms-squared input: `**Name**{: style="font-size: 1.85em; ..."}`
      // Without leading-`:` handling the brace block survived and broke MDX.
      const src = '**Deniz Raif Durmaz**{: style="font-size: 1.85em; color: white;"}\n';
      const report = { bareAttrLines: [], inlineAttrLists: [], spanAnchorsStripped: [] };
      const out = sanitizeMdxSyntax(src, report);
      expect(out).not.toContain('{: style');
      expect(out).toContain('**Deniz Raif Durmaz**');
      expect(report.inlineAttrLists).toHaveLength(1);
    });

    it('strips trailing semicolon after the last attr value (CSS-ism)', () => {
      // `style="..." ;` — semicolon after the closing quote, common when
      // authors paste from CSS context.
      const src = 'Some **bold**{: style="color: red";}\n';
      const report = { bareAttrLines: [], inlineAttrLists: [], spanAnchorsStripped: [] };
      const out = sanitizeMdxSyntax(src, report);
      expect(out).toContain('**bold**');
      expect(out).not.toContain('{:');
      expect(report.inlineAttrLists).toHaveLength(1);
    });

    it('does not populate the collector for spans without an `id` attribute', () => {
      // `<span class="...">` doesn't declare an anchor — stripping it is
      // structural, not anchor-loss. Don't false-alarm the user.
      const src = '## <span class="warn">Heading\n';
      const report = {
        bareAttrLines: [],
        inlineAttrLists: [],
        spanAnchorsStripped: [],
      };
      sanitizeMdxSyntax(src, report);
      expect(report.spanAnchorsStripped).toEqual([]);
    });
  });

  describe('multi-line inline-code spans (CommonMark §6.1)', () => {
    it('treats a backtick span that wraps onto a second line as code, not as a new opener', () => {
      // Real-world (thoughtspot/cs_tools/changelog/1-6-0.md): bold prose
      // contains `\`ALTER TABLE …\nSET NOT NULL\` command.**{ .fc-red }`.
      // The inline-code span `ALTER TABLE … SET NOT NULL` legitimately spans
      // two lines (CommonMark allows this within a paragraph). The earlier
      // walker reset state at every `\n`, so the closing `\`` on line 2 was
      // read as a NEW opener — `{ .fc-red }` then survived the strip pass
      // and acorn rejected the bare attr list as a JS expression.
      const src = [
        '`ALTER TABLE TS_METADATA_OBJECT ALTER COLUMN is_sage_enabled',
        'SET NOT NULL` command.**{ .fc-red }',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      // The PyMdown attr list at the end MUST be stripped (it sits outside
      // the inline-code span, not inside it).
      expect(out).not.toContain('{ .fc-red }');
    });

    it('treats a stray odd-count of backticks on one line as orphan, NOT poisoning subsequent paragraphs', () => {
      // Real-world (PowerTools api_gateway.mdx line 922): a typo'd inline-
      // code span with 9 backticks on one line. After the paragraph break
      // (blank line), state must reset — otherwise every subsequent
      // sanitization pass thinks the rest of the document is inline-code.
      const src = [
        'Para with `mismatched ` backticks ` here.', // 5 ticks → 2 closed pairs + 1 orphan
        '',
        '<!-- comment must still get rewritten -->',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      // The HTML comment after the blank line MUST get rewritten — proves
      // we left inline-code state by the next paragraph.
      expect(out).toContain('{/* comment must still get rewritten */}');
      expect(out).not.toContain('<!--');
    });

    it('matches closing run length: 2-backtick close does not match a 1-backtick opener', () => {
      // CommonMark requires the closing run to match the opener exactly.
      // `` `\` foo \`\` bar \` `` starts a 1-tick code span. The middle
      // 2-tick run is content. The closing 1-tick reopens — actually
      // closes the original. Net: text is "`foo `` bar`" rendered as code.
      const src = '`open `` close`\n';
      const out = sanitizeMdxSyntax(src);
      // No transform should fire inside the code span; output equals input.
      expect(out).toBe(src);
    });
  });

  describe('inline-code state resets at newlines (CommonMark rule)', () => {
    it('does not let a stray odd-count-backticks line poison the rest of the document', () => {
      // Real-world AWS Powertools `api_gateway.mdx` line 922:
      //   2. \`firstName\` becomes \`first_name\` and lastName\`becomes\`last\\_name\`
      // 9 backticks on the line because of a typo'd inline-code span. If
      // walkOutsideCode tracks inline-code state across the newline, the
      // remaining 700+ lines of the file are treated as one long inline-
      // code span and HTML comments (etc.) are silently passed through.
      const src = [
        'Para with `mismatched ` backticks ` here.', // ODD count: 5 backticks
        '',
        '<!-- markdownlint-disable -->',
        '',
        '<br>',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      // The HTML comment should still be converted to a JSX comment, even
      // though the prior line had odd-count backticks.
      expect(out).toContain('{/* markdownlint-disable */}');
      // And the void-element <br> should still be self-closed.
      expect(out).toContain('<br/>');
    });

    it('still tracks inline code correctly within a single line', () => {
      // Inline code still works inside a line — the reset only happens at
      // newlines, not mid-line.
      const src = 'Use `<!-- in code -->` for HTML comments.\n';
      const out = sanitizeMdxSyntax(src);
      // Comment INSIDE inline code is preserved as-is.
      expect(out).toContain('`<!-- in code -->`');
    });
  });

  describe('void-element closing-tag rewrite', () => {
    it('rewrites </br> to <br/> (PowerTools data_masking case)', () => {
      // Real-world: PowerTools `data_masking.mdx` line 131 uses `</br></br>`
      // as a paragraph break. Void elements have no closing tag in HTML, but
      // Material authors emit them anyway. MDX rejects the unmatched closer
      // with "expected corresponding closing tag for <TabItem>"; rewrite
      // each closer to a self-closed opener.
      const src = 'Line one. </br></br>Line two.\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toBe('Line one. <br/><br/>Line two.\n');
    });

    it('rewrites </hr> to <hr/>', () => {
      const out = sanitizeMdxSyntax('text </hr> more\n');
      expect(out).toBe('text <hr/> more\n');
    });

    it('leaves real closing tags for non-void elements alone', () => {
      // `</sub>` is a valid closing tag for a non-void element — don't touch it.
      const out = sanitizeMdxSyntax('H<sub>2</sub>O is water.\n');
      expect(out).toBe('H<sub>2</sub>O is water.\n');
    });
  });

  describe('orphan brace with backslash-escape body', () => {
    it('escapes `{` of a JSON-shaped table cell with remark-escaped underscores', () => {
      // Real-world: PowerTools `idempotency.mdx` line 597 contains a
      // markdown table with a "data" cell `{"user\_id": 12391, "message": "success"}`.
      // remark stringifies underscore as `\_` because `_user_id_` would
      // otherwise read as emphasis. JS does not recognize `\_` as an escape;
      // acorn raises "Could not parse expression".
      const src = '| status | data |\n| --- | --- |\n| OK | {"user\\_id": 12391, "message": "success"} |\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&#123;"user\\_id"');
    });

    it('leaves `{` followed by valid JSX expression alone', () => {
      // `{count}` is a real JSX expression — must not be escaped.
      const out = sanitizeMdxSyntax('Count: {count}\n');
      expect(out).toBe('Count: {count}\n');
    });

    it('escapes `{` in a markdown table cell when no `}` closes it on the same line', () => {
      // Real-world (jujimeizuo/note/cs/others/regex.md): a regex-syntax
      // reference table has a cell `| {  | 标记限定符表达式 ... |` —
      // the `{` is literal text describing regex's repetition opener and
      // has no matching `}` on the line. Without escaping, MDX raises
      // "Unexpected end of file in expression, expected a corresponding
      // closing brace for `{`".
      const src = '| char | desc |\n| --- | --- |\n| {  | repetition opener |\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&#123;');
      expect(out).not.toMatch(/\| \{  \|/);
    });

    it('escapes regex-syntax `{n,}` / `{n,m}` literals in markdown table cells', () => {
      // Real-world (jujimeizuo/note/cs/others/regex.md): a regex reference
      // table with cells like `| {n}   | matches exactly n times |` and
      // `| {n,}  | matches at least n times |`. The `{n,}` parses as a JSX
      // expression with trailing-comma — acorn rejects with "Could not
      // parse expression with acorn". Detect by table-cell context (`{`
      // preceded by `|` and only whitespace on the same line).
      const src = '| syntax | desc |\n| --- | --- |\n| {n,m} | repetition range |\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&#123;n,m}');
      expect(out).not.toContain('| {n,m}');
    });

    it('escapes inline regex `{2,}` / `{0,}` even when not at table-cell start', () => {
      // Same source as above but the regex pattern appears mid-cell or in
      // running prose: `如 o{2,} 可以匹配...`. The `{2,}` body ends with a
      // bare comma — never valid JSX (sequence expression with empty
      // second operand) — so escape on the trailing-`,` heuristic.
      const src = '示例：o{2,} 匹配两个或更多 o\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('o&#123;2,}');
    });

    it('escapes Python-style `{key: value, ...}` placeholder spread in prose', () => {
      // Real-world (jujimeizuo/note/cs/pl/python/basic.md): bullet-list
      // examples like `{key: value, ...}` look like JSX object literals
      // but the bare `...` (no value to spread) makes acorn fail with
      // "Could not parse expression with acorn".
      const src = '- 字典: {key: value, ...}\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&#123;key: value');
    });

    it('escapes braces and angle brackets inside a `<script>` block', () => {
      // Real-world (jujimeizuo/note/index.md): an embedded `<script>` block
      // contains JS source with `{...}` braces and `"<span class=\"x\">"`
      // string literals. MDX parses children of `<script>` as JSX, so the
      // escaped quotes inside string literals and `{` braces both crash
      // the parser. Treat the entire `<script>...</script>` body as opaque
      // text by HTML-entity-escaping its braces.
      const src = '<script>\nif (y == 0) {\n  var s = "x";\n}\n</script>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('<script>');
      expect(out).toContain('</script>');
      // Braces inside the script body must be escaped.
      expect(out).toMatch(/&lcub;|&#123;/);
    });

    it('respects fence-length matching: 3-backtick line inside a 4-backtick fence does not close it', () => {
      // Real-world (freya022/BotCommands-Wiki): a 4-backtick fenced block
      // wraps a `:::tabs` snippet whose body has a `:::` line followed
      // by `::::` — every line between the 4-tick opener and closer is
      // text, but our walker previously toggled `inFence` on the inner
      // ```java line (3 backticks, not enough to close a 4-tick fence).
      // After the real 4-tick closer it thought it was BACK inside a
      // fence → escapers skipped subsequent lines → the next `<--` slipped
      // through and crashed MDX. Mirrors the actual file shape from the
      // freya022 fixture.
      const src = [
        '````',
        '::::tabs',
        ':::tab[Java]',
        '```java',
        ':::',
        '::::',
        '````',
        '',
        'after the fence: 8<-- text',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      // The `<` after the fence is in prose and must be escaped.
      expect(out).toContain('8&lt;-- text');
    });

    it('auto-closes orphan `<span>` openers at the next paragraph break', () => {
      // Real-world (thoughtspot/cs_tools/guides/process-searchable.md):
      // an outer `<sub>` block wraps `<b>...</b> <span class="fc-gray">…`
      // whose closer the author forgot. MDX errors with "Expected a
      // closing tag for `<span>` before the end of paragraph". The
      // `<span>` is mid-paragraph (after `<b>...</b> `), so the
      // start-of-line strip doesn't apply. Defensive auto-close at the
      // next blank line preserves the intent.
      const src = [
        '<b class="fc-purple">x</b> <span class="fc-gray">Head on over to the',
        'docs to learn more.',
        '',
        'next paragraph',
        '',
      ].join('\n');
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('</span>');
    });

    it('unescapes `\\<X>` and `\\</X>` left by remark-stringify in front of JSX tags', () => {
      // remark-stringify escapes `<` to `\<` after some markdown idioms
      // (closing emphasis, end-of-line) to keep CommonMark unambiguous.
      // MDX, however, reads `\<` as a backslash-escape and refuses to
      // parse the following `/sup>` as a closing tag — leaving the
      // earlier `<sup>` opener orphaned. Real-world (thoughtspot/cs_tools):
      // bold/italic spans wrap `<sup>` inline elements.
      const src = '<sup>foo\\</sup>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('</sup>');
      expect(out).not.toContain('\\</sup>');
    });

    it('rewrites `<sup>x</>` to `<sup>x</sup>` so the orphan opener gets a matching closer', () => {
      // Real-world (thoughtspot/cs_tools): source authors write `<sup>foo</>`
      // as a shorthand for `<sup>foo</sup>`. CommonMark would render it
      // (HTML pass-through is permissive); MDX rejects the bare `</>`
      // (empty fragment closer with no opener). Without rewriting, the
      // existing orphan-fragment-delimiter escaper turns `</>` into
      // `&lt;/&gt;` and leaves `<sup>` opener without a matching closer.
      const src = '<sup>_note_</>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('</sup>');
      expect(out).not.toContain('</>');
      expect(out).not.toContain('&lt;/&gt;');
    });

    it('handles `<sub class="x">y</>` (orphan-fragment closer with attrs on opener)', () => {
      const src = '<sub class="fc-gray">requires py 3.9</>\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('</sub>');
      expect(out).not.toContain('</>');
    });

    it('escapes shell-style `${VAR}` interpolation that MDX would read as $+{expr}', () => {
      // Real-world (Colm3na/DocsColmena/ghost.md): an Apache config block
      // contains `ErrorLog ${APACHE_LOG_DIR}/error.log`. MDX reads `$` as
      // text and `{APACHE_LOG_DIR}` as a JSX expression that references an
      // undefined identifier → runtime error
      // `ReferenceError: APACHE_LOG_DIR is not defined`. The `$` prefix is
      // a strong signal that the brace is a shell/template variable, not JSX.
      const src = 'ErrorLog ${APACHE_LOG_DIR}/error.log\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('&#123;APACHE_LOG_DIR}');
      expect(out).not.toContain('${APACHE_LOG_DIR}');
    });
  });

  describe('malformed inline attr_list fallback', () => {
    it('escapes `{target="\\_blank}` (typo: missing closing quote)', () => {
      // Real-world: PowerTools `tutorial/index.md` source contains the typo
      // `{target="_blank}` (missing closing `"`). The strict
      // `stripInlineAttrLists` rejects it because of unbalanced quotes;
      // without an escape, the `{` survives and crashes acorn. Fallback
      // pass detects `{identifier=...}` shape and escapes the brace.
      const out = sanitizeMdxSyntax('See [link](url){target="\\_blank}.\n');
      expect(out).toContain('&#123;target="\\_blank}');
    });

    it('preserves Starlight directive attribute block `:::note[Title]{icon="..."}`', () => {
      // Real-world (cristyalmonte/learnnostr, mindspore-lab/mindnlp): the
      // admonition AST plugin emits Starlight v0.34+ icon attributes on
      // directive openers. The `{icon="information"}` looks superficially
      // like a malformed attr_list, but it is the legitimate directive
      // metadata syntax — escaping the `{` to `&#123;` reduces the
      // admonition to plain paragraph text in the rendered HTML.
      const src = ':::note[Learning Objectives]{icon="information"}\nbody\n:::\n';
      const out = sanitizeMdxSyntax(src);
      expect(out).toContain('{icon="information"}');
      expect(out).not.toContain('&#123;');
    });
  });
});
