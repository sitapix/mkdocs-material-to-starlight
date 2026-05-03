/**
 * End-to-end conversion of 5 representative real-world MkDocs Material
 * projects. Each test builds a minimal `docs/` tree alongside the saved
 * `mkdocs.yml` from the corpus, runs `convertSiteFromDisk`, and asserts:
 *   1. The conversion returns Result.ok.
 *   2. The output contains a buildable Astro project skeleton.
 *   3. MIGRATION_NOTES.md mentions every detected plugin.
 *   4. astro.config.mjs has matching braces / a single export default.
 *
 * The synthetic docs/ tree exercises the syntactic features the project
 * uses in production — admonitions, snippets, content tabs, code blocks,
 * etc. — without trying to reproduce the entire site.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'real-configs');

interface E2ECase {
  readonly name: string;
  readonly configFile: string;
  readonly docs: ReadonlyArray<{ readonly path: string; readonly content: string }>;
  readonly expectInNotes: ReadonlyArray<string>;
  readonly expectInConfig: ReadonlyArray<string>;
}

const baseAdmonitions = `# Welcome

!!! note "Welcome"
    A simple admonition.

!!! tip
    A tip without a title.

??? abstract "Collapsible"
    Hidden by default.

\`\`\`python title="example.py" linenums="2" hl_lines="3"
def hello():
    print("hi")
    return 42
\`\`\`

=== "Bash"
    \`\`\`bash
    echo hello
    \`\`\`
=== "Python"
    \`\`\`python
    print("hi")
    \`\`\`

| Col 1 | Col 2 |
|-------|-------|
| a     | b     |
`;

const CASES: ReadonlyArray<E2ECase> = [
  {
    name: 'baseline material',
    configFile: 'material.yml',
    docs: [
      { path: 'index.md', content: baseAdmonitions },
      { path: 'about.md', content: '# About\n\nText.\n' },
    ],
    expectInNotes: [],
    expectInConfig: ['title:'],
  },
  {
    name: 'fastapi (Tiangolo template)',
    configFile: 'fastapi.yml',
    docs: [
      {
        path: 'index.md',
        content:
          '# FastAPI\n\n<!-- only-mkdocs -->\nDocs-only block.\n<!-- /only-mkdocs -->\n\n!!! note\n    Body.\n',
      },
    ],
    expectInNotes: ['plugin-macros'],
    expectInConfig: ['title:'],
  },
  {
    name: 'pydantic (kitchen sink)',
    configFile: 'pydantic.yml',
    docs: [{ path: 'index.md', content: '# Pydantic\n\n!!! note\n    Body.\n' }],
    expectInNotes: ['plugin-mkdocstrings'],
    expectInConfig: ['title:'],
  },
  {
    name: 'hatch (mike + glightbox + click)',
    configFile: 'hatch.yml',
    docs: [{ path: 'index.md', content: '# Hatch\n\nText.\n' }],
    expectInNotes: ['plugin-click'],
    expectInConfig: ['title:'],
  },
  {
    name: 'mkdocstrings-python (Pawamoy template)',
    configFile: 'mkdocstrings-python.yml',
    docs: [{ path: 'index.md', content: '# mkdocstrings-python\n\nText.\n' }],
    expectInNotes: ['plugin-mkdocstrings'],
    expectInConfig: ['title:'],
  },
];

function bracesBalance(text: string): boolean {
  let depth = 0;
  let inString: '"' | "'" | '`' | null = null;
  let prev = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    if (inString !== null) {
      if (ch === inString && prev !== '\\') inString = null;
      prev = ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
    } else if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
    prev = ch;
  }
  return depth === 0;
}

describe('all-real-configs end-to-end', () => {
  // Smoke-convert every real config in fixtures/real-configs (excluding INHERIT
  // bases) with a minimal index.md. Every conversion must produce Result.ok.
  // This catches conversion-time regressions that the parse-only smoke test
  // doesn't cover.
  const INHERIT_BASES = new Set(['hatch-insiders.yml', 'typer-env.yml']);
  const allYml = (() => {
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    return readdirSync(FIXTURES)
      .filter((f) => f.endsWith('.yml'))
      .filter((f) => !INHERIT_BASES.has(f))
      .sort();
  })();

  let projDir: string;
  let outDir: string;
  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'mts-allreal-proj-'));
    outDir = mkdtempSync(join(tmpdir(), 'mts-allreal-out-'));
  });
  afterEach(() => {
    rmSync(projDir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  });

  for (const filename of allYml) {
    it(`smoke-converts ${filename}`, async () => {
      copyFileSync(join(FIXTURES, filename), join(projDir, 'mkdocs.yml'));
      // Read the actual docs_dir from the YAML (may be non-default like
      // `docs/developer` or `docs/en/`) and create a minimal index.md there.
      const cfgRaw = readFileSync(join(FIXTURES, filename), 'utf8');
      const docsDirMatch = cfgRaw.match(/^docs_dir:\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?$/m);
      const docsRel = (docsDirMatch?.[1] ?? 'docs').replace(/\/+$/, '');
      mkdirSync(join(projDir, docsRel), { recursive: true });
      writeFileSync(
        join(projDir, docsRel, 'index.md'),
        `# ${filename}\n\nSmoke test page.\n`,
      );
      const result = await convertSiteFromDisk({
        projectDir: projDir,
        outputDir: outDir,
      });
      if (!result.ok) {
        throw new Error(
          `${filename}: ${result.error.code}: ${result.error.message}`,
        );
      }
      expect(result.ok).toBe(true);
      // Output skeleton always present.
      const cfg = readFileSync(join(outDir, 'astro.config.mjs'), 'utf8');
      expect(bracesBalance(cfg)).toBe(true);
    });
  }
});

describe('real-world end-to-end', () => {
  let projectDir: string;
  let outputDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mts-real-proj-'));
    outputDir = mkdtempSync(join(tmpdir(), 'mts-real-out-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  for (const c of CASES) {
    it(`converts ${c.name}`, async () => {
      copyFileSync(join(FIXTURES, c.configFile), join(projectDir, 'mkdocs.yml'));
      mkdirSync(join(projectDir, 'docs'), { recursive: true });
      for (const doc of c.docs) {
        const dir = doc.path.includes('/')
          ? doc.path.slice(0, doc.path.lastIndexOf('/'))
          : '';
        if (dir.length > 0) {
          mkdirSync(join(projectDir, 'docs', dir), { recursive: true });
        }
        writeFileSync(join(projectDir, 'docs', doc.path), doc.content);
      }

      const result = await convertSiteFromDisk({ projectDir, outputDir });
      if (!result.ok) {
        throw new Error(
          `convertSiteFromDisk failed for ${c.name}: ${result.error.code}: ${result.error.message}`,
        );
      }
      const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
      const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'));
      const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
      expect(cfg).toContain('defineConfig');
      expect(cfg).toContain('export default');
      expect(bracesBalance(cfg)).toBe(true);
      for (const expected of c.expectInConfig) {
        expect(cfg).toContain(expected);
      }
      for (const expected of c.expectInNotes) {
        expect(notes).toContain(expected);
      }
      expect(pkg.dependencies).toHaveProperty('@astrojs/starlight');
      expect(pkg.dependencies).toHaveProperty('astro');
    });
  }
});
