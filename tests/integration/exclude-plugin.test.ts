import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

let project: string;
let out: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'mk2sl-exclude-'));
  out = mkdtempSync(join(tmpdir(), 'mk2sl-exclude-out-'));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

function writeMkdocs(plugins: string): void {
  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(
    join(project, 'mkdocs.yml'),
    `site_name: T\ntheme: { name: material }\nplugins:\n${plugins}\n`,
  );
}

function writeDoc(relPath: string, body: string): void {
  const abs = join(project, 'docs', relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, body);
}

function expectPagePresent(relMdPath: string): void {
  // Pages emit at `<out>/src/content/docs/<slug>.md` — the plain content path.
  const candidate = join(out, 'src', 'content', 'docs', relMdPath);
  expect(existsSync(candidate)).toBe(true);
}

function expectPageAbsent(relMdPath: string): void {
  const candidate = join(out, 'src', 'content', 'docs', relMdPath);
  expect(existsSync(candidate)).toBe(false);
}

describe('mkdocs-exclude integration — files excluded by glob never reach the output', () => {
  it('drops *.tmp files at any depth', async () => {
    writeMkdocs('  - exclude:\n      glob:\n        - "*.tmp"');
    writeDoc('index.md', '# Home');
    writeDoc('keep.md', '# Keep');
    writeDoc('drop.tmp', '# Should not appear');
    writeDoc('nested/also.tmp', '# Nested temp');
    writeDoc('nested/page.md', '# Nested keep');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectPagePresent('index.md');
    expectPagePresent('keep.md');
    expectPagePresent('nested/page.md');
    // Excluded files don't get emitted under any extension.
    expectPageAbsent('drop.tmp');
    expectPageAbsent('drop.md');
    expectPageAbsent('nested/also.tmp');
    expectPageAbsent('nested/also.md');
  });

  it('drops files matching a directory-prefix glob', async () => {
    writeMkdocs('  - exclude:\n      glob:\n        - "private/*"');
    writeDoc('index.md', '# Home');
    writeDoc('private/secret.md', '# Should not appear');
    writeDoc('public/visible.md', '# Visible');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    expectPagePresent('index.md');
    expectPagePresent('public/visible.md');
    expectPageAbsent('private/secret.md');
  });

  it('drops files matching a regex pattern', async () => {
    writeMkdocs('  - exclude:\n      regex:\n        - "\\\\.draft\\\\."');
    writeDoc('index.md', '# Home');
    writeDoc('foo.draft.md', '# Drafty');
    writeDoc('clean.md', '# Clean');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    expectPagePresent('index.md');
    expectPagePresent('clean.md');
    expectPageAbsent('foo.draft.md');
  });

  it('emits an info diagnostic acknowledging auto-handling (in migration notes)', async () => {
    writeMkdocs('  - exclude:\n      glob:\n        - "*.tmp"');
    writeDoc('index.md', '# Home');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Plugin-level diagnostics surface in MIGRATION_NOTES.md, not the
    // per-file diagnostics array.
    expect(result.value.migrationNotesSource).toContain('plugin-exclude-mapped');
    expect(result.value.migrationNotesSource.toLowerCase()).toContain('auto-handled');
  });

  it('a project without mkdocs-exclude is unaffected (regression)', async () => {
    writeMkdocs('  - search');
    writeDoc('index.md', '# Home');
    writeDoc('keep.tmp', '# Would have been dropped');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    expectPagePresent('index.md');
    // The .tmp wouldn't be emitted as a doc because it's not .md/.mdx, but the
    // sourceListing filter is *.{md,mdx} so this is naturally absent. Verify
    // we didn't accidentally drop the .md.
    expectPagePresent('index.md');
  });

  it('still runs when the exclude block is empty (no patterns at all)', async () => {
    writeMkdocs('  - exclude: {}');
    writeDoc('index.md', '# Home');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    expectPagePresent('index.md');
  });

  it('the index page survives exclusion of every other page', async () => {
    writeMkdocs('  - exclude:\n      glob:\n        - "drop-*.md"');
    writeDoc('index.md', '# Home');
    writeDoc('drop-1.md', '# Gone');
    writeDoc('drop-2.md', '# Gone');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // index.md is the home page slug — read it and confirm the body survived.
    const indexBody = readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(indexBody).toContain('Home');
  });
});
