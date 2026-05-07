import { describe, expect, it } from 'vitest';
import { normalizeFileTrees } from './file-tree.js';

const ASCII_TREE = [
  '```',
  'my-project/',
  '├── src/',
  '│   ├── index.ts',
  '│   └── lib.ts',
  '└── README.md',
  '```',
  '',
].join('\n');

describe('normalizeFileTrees', () => {
  describe('positive — promotes qualifying code fences', () => {
    it('promotes an ASCII tree code fence to <FileTree>', () => {
      const result = normalizeFileTrees(ASCII_TREE);
      expect(result.promoted).toBe(true);
      expect(result.text).toContain('<FileTree>');
      expect(result.text).toContain('</FileTree>');
    });

    it('does NOT contain the original fenced code block', () => {
      const result = normalizeFileTrees(ASCII_TREE);
      expect(result.text).not.toContain('```');
    });

    it('contains the root directory as a list item', () => {
      const result = normalizeFileTrees(ASCII_TREE);
      expect(result.text).toContain('my-project/');
    });

    it('contains nested file entries', () => {
      const result = normalizeFileTrees(ASCII_TREE);
      expect(result.text).toContain('index.ts');
      expect(result.text).toContain('lib.ts');
      expect(result.text).toContain('README.md');
    });

    it('emits a diagnostic', () => {
      const result = normalizeFileTrees(ASCII_TREE);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]?.ruleId).toBe('code-fence-promoted-to-filetree');
    });

    it('works with a text-language fence', () => {
      const src = ['```text', 'project/', '├── a.ts', '└── b.ts', '```', ''].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(true);
      expect(result.text).toContain('<FileTree>');
    });

    it('preserves indentation structure in list items', () => {
      const result = normalizeFileTrees(ASCII_TREE);
      // src/ is a child of my-project/, so it should be indented
      const lines = result.text.split('\n');
      const srcLine = lines.find((l) => l.includes('src/'));
      expect(srcLine).toBeTruthy();
      // It should be indented (not at root level)
      expect(srcLine).toMatch(/^\s+- src\//);
    });
  });

  describe('negative — does NOT promote', () => {
    it('does NOT promote a regular text code block', () => {
      const src = [
        '```',
        'Hello world',
        'This is just text',
        'No tree structure here',
        '```',
        '',
      ].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
      expect(result.text).toBe(src);
    });

    it('does NOT promote a code block with a programming language', () => {
      const src = ['```bash', 'project/', '├── src/', '└── README.md', '```', ''].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
    });

    it('does NOT promote when fewer than 2 lines have box-drawing chars', () => {
      const src = ['```', 'my-project/', '├── src/', 'README.md', '```', ''].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
    });

    it('does NOT promote a fence with fewer than 3 content lines', () => {
      const src = ['```', 'project/', '└── file.ts', '```', ''].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
    });

    it('is idempotent — already contains <FileTree>, skip', () => {
      const src = '<FileTree>\n- project/\n  - src/\n</FileTree>\n';
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
      expect(result.text).toBe(src);
    });

    it('does NOT mistake a closing fence of a non-tree code block as a tree fence open (fastapi regression)', () => {
      // Real-world fastapi index.md regression: the closing ``` of a Python
      // code block was misread as the OPENING of a no-language fence, then
      // the promoter swallowed everything up to the next ``` (a console
      // block 30 lines later) and emitted that as a <FileTree>. Result:
      // unrelated prose, headings, and HTML wrapped in <FileTree> bullets.
      // The console block contains many `│` characters (the file-tree box-
      // drawing detector) so the heuristic falsely classifies the absorbed
      // content as a directory tree.
      const src = [
        '```Python',
        'from foo import bar',
        '```', // close of Python fence
        '',
        '**Note**:', // first non-blank after close
        '',
        'Some prose with no tree structure.',
        '',
        '```console',
        '$ run',
        '│ row 1 │',
        '│ row 2 │',
        '│ row 3 │',
        '│ row 4 │',
        '```',
        '',
      ].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
      expect(result.text).not.toContain('<FileTree>');
    });

    it('does NOT promote a fence whose first non-blank line is markdown prose, not a directory name', () => {
      // The first-line heuristic must reject obvious-prose tokens like bold
      // (`**X**`), punctuated text (`Note:`), or anything with formatting —
      // not just things containing slashes or spaces.
      const src = ['```', '**Note**:', '├── stuff', '└── more', '```', ''].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(false);
    });
  });

  describe('block-spacing — promoted output is unambiguously block-level JSX', () => {
    it('inserts blank lines around <FileTree>/</FileTree> when adjacent content is non-blank', () => {
      // Real-world: pyodide-mkdocs-theme wraps file-tree fences in Jinja
      // raw markers without blank-line padding:
      //   {% raw %}
      //   ```
      //   tree...
      //   ```
      //   {% endraw %}
      // Without padding around the emitted `<FileTree>` block, MDX folds
      // the JSX into the same paragraph as the prior inline content and
      // raises "Expected a closing tag for <FileTree> before end of paragraph".
      const src = [
        '`{% raw %}`',
        '```',
        '.',
        '├── one.py',
        '└── two.py',
        '```',
        '`{% endraw %}`',
        '',
      ].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(true);
      const lines = result.text.split('\n');
      const openIdx = lines.indexOf('<FileTree>');
      const closeIdx = lines.indexOf('</FileTree>');
      expect(openIdx).toBeGreaterThan(0);
      expect(closeIdx).toBeGreaterThan(openIdx);
      // Line immediately before <FileTree> must be blank.
      expect(lines[openIdx - 1]).toBe('');
      // Line immediately after </FileTree> must be blank.
      expect(lines[closeIdx + 1]).toBe('');
    });

    it('does not double-blank when a blank line already exists (idempotency-friendly)', () => {
      // A fence already preceded by a blank stays single-blank. A second
      // normalize run must not pile up blanks.
      const src = [
        'Intro text.',
        '',
        '```',
        '.',
        '├── a',
        '└── b',
        '```',
        '',
        'Closing text.',
        '',
      ].join('\n');
      const result = normalizeFileTrees(src);
      expect(result.promoted).toBe(true);
      const lines = result.text.split('\n');
      const openIdx = lines.indexOf('<FileTree>');
      // Only ONE blank line before — not two.
      expect(lines[openIdx - 1]).toBe('');
      expect(lines[openIdx - 2]).toBe('Intro text.');
      const closeIdx = lines.indexOf('</FileTree>');
      expect(lines[closeIdx + 1]).toBe('');
      expect(lines[closeIdx + 2]).toBe('Closing text.');
    });
  });
});
