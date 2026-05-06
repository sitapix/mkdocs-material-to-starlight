import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

let project: string;
let out: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'mk2sl-media-'));
  out = mkdtempSync(join(tmpdir(), 'mk2sl-media-out-'));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

/**
 * Use a non-index.md page name; index.md triggers landing-page detection
 * which absorbs early images into a hero frontmatter block, breaking these
 * focused media tests.
 */
function writeProject(body: string, plugins: string = '  - search'): void {
  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(
    join(project, 'mkdocs.yml'),
    `site_name: T\ntheme: { name: material }\nplugins:\n${plugins}\n`,
  );
  writeFileSync(join(project, 'docs', 'index.md'), '# Home\n');
  writeFileSync(join(project, 'docs', 'tutorial.md'), body);
}

function readTutorial(ext: 'md' | 'mdx' = 'md'): string {
  return readFileSync(
    join(out, 'src', 'content', 'docs', `tutorial.${ext}`),
    'utf8',
  );
}

describe('mkdocs-video / mkdocs-audio integration — full pipeline', () => {
  it('promotes ![type:video](url) end-to-end through the per-file pipeline', async () => {
    writeProject('# Demo\n\nIntro paragraph.\n\n![type:video](https://example.com/clip.mp4)\n');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = readTutorial();
    expect(body).toContain('<video src="https://example.com/clip.mp4" controls></video>');
    expect(body).not.toContain('![type:video]');
  });

  it('promotes ![type:audio](url) end-to-end through the per-file pipeline', async () => {
    writeProject('# Listen\n\nIntro paragraph.\n\n![type:audio](/audio/podcast.mp3)\n');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const body = readTutorial();
    expect(body).toContain('<audio src="/audio/podcast.mp3" controls></audio>');
    expect(body).not.toContain('![type:audio]');
  });

  it('keeps the page as .md (no MDX promotion)', async () => {
    writeProject('# X\n\nBody.\n\n![type:video](v.mp4)\n');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(readTutorial('md')).toContain('<video');
    expect(() => readTutorial('mdx')).toThrow();
  });

  it('handles multiple media nodes in the same page', async () => {
    writeProject(
      '# Mixed\n\nParagraph one.\n\n![type:video](v.mp4)\n\nIntermission.\n\n![type:audio](a.mp3)\n',
    );

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = readTutorial();
    expect(body).toContain('<video src="v.mp4" controls></video>');
    expect(body).toContain('<audio src="a.mp3" controls></audio>');

    // One promotion diagnostic per occurrence (per-file diagnostics surface in
    // the API output's diagnostics array).
    const promoted = result.value.diagnostics.filter(
      (d) => d.diagnostic.ruleId === 'media-html5-promoted',
    );
    expect(promoted.length).toBe(2);
  });

  it('leaves regular images untouched', async () => {
    writeProject('# Page\n\nParagraph.\n\n![architecture](/img/arch.png)\n');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const body = readTutorial();
    expect(body).toContain('![architecture](/img/arch.png)');
    expect(body).not.toContain('<video');
    expect(body).not.toContain('<audio');
  });

  it('the plugin-level "auto-converted" diagnostic surfaces in the migration notes', async () => {
    writeProject(
      '# Demo\n\nBody.\n\n![type:video](v.mp4)\n',
      '  - search\n  - mkdocs-video',
    );

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Plugin-level diagnostics are written into migrationNotesSource (the
    // MIGRATION_NOTES.md the converter generates), not into the per-file
    // `diagnostics` array. Search there.
    expect(result.value.migrationNotesSource).toContain('plugin-video-recommend');
    expect(result.value.migrationNotesSource.toLowerCase()).toContain('auto-converted');
  });

  it('idempotent: re-running on the same source produces the same emitted body', async () => {
    writeProject('# X\n\nBody.\n\n![type:video](v.mp4)\n');

    const first = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(first.ok).toBe(true);
    const firstBody = readTutorial();

    const out2 = mkdtempSync(join(tmpdir(), 'mk2sl-media-out2-'));
    try {
      const second = await convertSiteFromDisk({
        projectDir: project,
        outputDir: out2,
      });
      expect(second.ok).toBe(true);
      const secondBody = readFileSync(
        join(out2, 'src', 'content', 'docs', 'tutorial.md'),
        'utf8',
      );
      expect(secondBody).toBe(firstBody);
    } finally {
      rmSync(out2, { recursive: true, force: true });
    }
  });
});
