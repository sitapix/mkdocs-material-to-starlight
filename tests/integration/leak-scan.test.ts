import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

/**
 * Integration "leak scanner": converts a synthetic site that exercises every
 * known PyMdown / Material syntax and asserts the converted output contains
 * NO literal source-syntax leaks (visible garbage that the diagnostic stream
 * doesn't capture).
 *
 * Why this exists: silent leaks have repeatedly made it through the rest of
 * the suite because:
 *   1. The validator only catches MDX parse errors. A `.md` file with
 *      visible literal `{ .md-button }` text parses fine but renders as junk.
 *   2. Per-transform unit tests focus on positive cases. They don't notice
 *      that an upstream transform left content the next pass should have
 *      consumed.
 *   3. Manual spot-checks scale with project count, not with feature matrix.
 *
 * Each pattern below was a real regression found by spot-inspecting one of
 * the 15 real-world projects converted in the development sessions. The
 * fixture forces every pattern through the full pipeline; if any fix
 * silently regresses, this test fails the build.
 */

describe('converted output is leak-free across all known PyMdown shapes', () => {
  let projectDir: string;
  let outputDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'leak-scan-src-'));
    outputDir = mkdtempSync(join(tmpdir(), 'leak-scan-out-'));
    mkdirSync(join(projectDir, 'docs'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  function writeSite(files: Record<string, string>): void {
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: LeakScan',
        'theme:',
        '  name: material',
        'nav:',
        ...Object.keys(files).map((p) => `  - ${p}: ${p}`),
        '',
      ].join('\n'),
    );
    for (const [path, body] of Object.entries(files)) {
      writeFileSync(join(projectDir, 'docs', path), body, 'utf8');
    }
  }

  function listOutputFiles(): string[] {
    const out: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
          out.push(full);
        }
      }
    }
    const root = join(outputDir, 'src', 'content', 'docs');
    walk(root);
    return out;
  }

  function scanLeaks(): { pattern: string; file: string; line: number; text: string }[] {
    const leaks: { pattern: string; file: string; line: number; text: string }[] = [];
    const patterns: Array<[string, RegExp]> = [
      // Bare PyMdown admonitions and collapsibles
      ['admonition !!!', /^!!! /],
      ['collapsible ???', /^\?\?\? /],
      ['collapsible ???+', /^\?\?\?\+ /],
      // PyMdown content tabs
      ['tab === "', /^=== "/],
      // PyMdown attr-list survivors
      ['{.class} attr-list', /\{\s*\.[a-z][a-z-]*(\s+[.#][\w-]+|\s+\w+="[^"]*")*\s*\}/],
      // Icon shortcodes (only flag those NOT inside JSX prop strings or
      // already converted to :icon[...] directives)
      [':material- icon', /(?:^|[^"=])(:material-[a-z-]+:)/],
      [':fontawesome- icon', /(?:^|[^"=])(:fontawesome-[a-z-]+:)/],
      // AsciiDoc legacy
      ['<<xref>>', /<<[a-z][^>]*>>/],
      // mkdocs include directive
      ['{!include!}', /\{!.*?!\}/],
    ];

    for (const file of listOutputFiles()) {
      const txt = readFileSync(file, 'utf8');
      const lines = txt.split('\n');
      let inFence = false;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? '';
        // Skip lines that are valid fenced code openers/closers OR inside
        // fences. Fences in the converter use 3+ backticks/tildes with no
        // closing backticks for backtick fences (per CommonMark §4.5).
        if (/^ {0,3}(`{3,}[^`\n]*|~{3,}[^\n]*)$/.test(line)) {
          inFence = !inFence;
          continue;
        }
        if (inFence) continue;
        for (const [name, pat] of patterns) {
          if (pat.test(line)) {
            leaks.push({
              pattern: name,
              file: relative(outputDir, file),
              line: i + 1,
              text: line.length > 100 ? line.slice(0, 100) + '…' : line,
            });
          }
        }
      }
    }
    return leaks;
  }

  it('produces no leaks for a synthetic site exercising every known pattern', async () => {
    writeSite({
      // Every leak category that has surfaced this session, in one file each.
      'admonitions.md': [
        '# Admonitions',
        '',
        '!!! note',
        '    With type, no title.',
        '',
        '!!! warning "With Title"',
        '    Body.',
        '',
        '??? "Typeless collapsible"',
        '    Body content.',
        '',
        '???+ "Typeless open collapsible"',
        '    More body content here.',
        '',
        '```python',
        '!!! this is not a real admonition (inside fence)',
        '```',
        '',
      ].join('\n'),

      'fence-edge.md': [
        '# Fence edge',
        '',
        // Triple-backtick inline code that previously fooled the fence detector.
        ['```', 'snippet {path="x.py"}', '```'].join(''),
        '',
        '!!! note',
        '    Must convert: real admonition after fake-fence inline code.',
        '',
      ].join('\n'),

      'attr-lists.md': [
        '# Attribute lists',
        '',
        'Para text.',
        '{ .card }',
        '',
        '_styled phrase_ :icon[heart]{ .mdx-heart .mdx-insiders }',
        '',
        'Card grid item :material-link:{ .lg .middle } **Step**',
        '',
      ].join('\n'),

      'buttons.md': [
        '# Buttons',
        '',
        '[Inline button](./demo.md){ .md-button .md-button--primary }',
        '',
        '[Reference button][demo]{ .md-button }',
        '',
        '[demo]: ./demo.md',
        '',
        '## Demo',
        '',
        'Target.',
        '',
      ].join('\n'),

      'demo.md': '# Demo\n\nTarget for buttons.\n',

      'icons.md': [
        '# Icons',
        '',
        // Mid-label icon inside a tab — surfaced via blog plugin docs.
        '=== ":material-link: blog/2024/01/:material-dots-horizontal:/"',
        '    code in tab.',
        '',
        // Icon shortcode inside an HTML-block-wrapped link.
        '<div style="text-align: center;">',
        '[Download :material-download:](https://example.com/x)',
        '</div>',
        '',
      ].join('\n'),

      'grids.md': [
        '# Grids',
        '',
        // Grid wrapped in an outer HTML container.
        '<div class="result" markdown>',
        '  <div class="grid cards" markdown>',
        '',
        '- :fontawesome-brands-html5: HTML',
        '- :fontawesome-brands-js: JavaScript',
        '',
        '  </div>',
        '</div>',
        '',
      ].join('\n'),

      'span-anchors.md': [
        '# Span anchors',
        '',
        '## <span id="legacy-anchor"> Released',
        '',
        'Body.',
        '',
      ].join('\n'),

      'asciidoc.md': [
        '# AsciiDoc legacy',
        '',
        'See <<other-page#section, the other page>>.',
        '',
        '<<#anchor, click here>>.',
        '',
        '[[some-anchor-id]] still here.',
        '',
      ].join('\n'),
    });

    const result = await convertSiteFromDisk({
      projectDir,
      outputDir,
    });
    expect(result.ok).toBe(true);

    const leaks = scanLeaks();
    if (leaks.length > 0) {
      const grouped = leaks.reduce<Record<string, typeof leaks>>((acc, l) => {
        acc[l.pattern] = acc[l.pattern] ?? [];
        acc[l.pattern]!.push(l);
        return acc;
      }, {});
      const summary = Object.entries(grouped)
        .map(([k, v]) => `  ${k}: ${v.length}\n${v.slice(0, 3).map((x) => `    ${x.file}:${x.line}: ${x.text}`).join('\n')}`)
        .join('\n');
      throw new Error(`Found ${String(leaks.length)} leaks of literal source syntax in converted output:\n${summary}`);
    }
  });
});
