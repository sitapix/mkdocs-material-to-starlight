import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakePrompter } from '../../use-cases/wizard/fake-prompter.js';
import { readProjectDirInteractively } from './wizard-project-dir.js';

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'wizard-project-dir-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const VALID_CONFIG = `site_name: Test Site\ndocs_dir: docs\n`;

function writeMkdocs(dir: string, contents: string = VALID_CONFIG): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'mkdocs.yml');
  writeFileSync(path, contents);
  return path;
}

describe('readProjectDirInteractively — happy path', () => {
  it('returns the loaded config when mkdocs.yml is at the given dir', async () => {
    writeMkdocs(workspace);
    const prompter = createFakePrompter({ path: [workspace] });

    const result = await readProjectDirInteractively(prompter, workspace);

    expect(result).not.toBe('cancelled');
    if (result === 'cancelled') return;
    expect(result.projectDir).toBe(workspace);
    expect(result.configValue.siteName).toBe('Test Site');
  });

  it('reports the loaded config path via spinner.stop', async () => {
    writeMkdocs(workspace);
    const prompter = createFakePrompter({ path: [workspace] });

    await readProjectDirInteractively(prompter, workspace);

    const completed = prompter.spinners.find((s) => s.stoppedWith?.includes('mkdocs.yml'));
    expect(completed).toBeDefined();
  });
});

describe('readProjectDirInteractively — cancellation paths', () => {
  it('returns "cancelled" when user cancels at the path prompt', async () => {
    const prompter = createFakePrompter({ path: [null] });

    const result = await readProjectDirInteractively(prompter, '/nonexistent');

    expect(result).toBe('cancelled');
  });

  it('returns "cancelled" after 3 failed attempts at finding mkdocs.yml', async () => {
    const empty1 = mkdtempSync(join(tmpdir(), 'empty1-'));
    const empty2 = mkdtempSync(join(tmpdir(), 'empty2-'));
    const empty3 = mkdtempSync(join(tmpdir(), 'empty3-'));
    try {
      const prompter = createFakePrompter({ path: [empty1, empty2, empty3] });

      const result = await readProjectDirInteractively(prompter, empty1);

      expect(result).toBe('cancelled');
      const errorLog = prompter.logs.find(
        (l) =>
          l.level === 'error' && /could not locate mkdocs\.yml after 3 attempts/i.test(l.message),
      );
      expect(errorLog).toBeDefined();
    } finally {
      rmSync(empty1, { recursive: true, force: true });
      rmSync(empty2, { recursive: true, force: true });
      rmSync(empty3, { recursive: true, force: true });
    }
  });
});

describe('readProjectDirInteractively — recovery paths', () => {
  it('re-prompts after invalid YAML, then succeeds on the retry', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'bad-yaml-'));
    try {
      writeMkdocs(bad, '::not valid yaml::\n  - [');
      writeMkdocs(workspace);
      const prompter = createFakePrompter({ path: [bad, workspace] });

      const result = await readProjectDirInteractively(prompter, bad);

      expect(result).not.toBe('cancelled');
      if (result === 'cancelled') return;
      expect(result.projectDir).toBe(workspace);

      const yamlError = prompter.spinners.find((s) => /not valid yaml/i.test(s.erroredWith ?? ''));
      expect(yamlError).toBeDefined();
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
  });

  it('re-prompts after a config missing required fields, then succeeds', async () => {
    const incomplete = mkdtempSync(join(tmpdir(), 'incomplete-'));
    try {
      // valid YAML but no `site_name`
      writeMkdocs(incomplete, 'docs_dir: docs\n');
      writeMkdocs(workspace);
      const prompter = createFakePrompter({ path: [incomplete, workspace] });

      const result = await readProjectDirInteractively(prompter, incomplete);

      expect(result).not.toBe('cancelled');
      if (result === 'cancelled') return;
      expect(result.projectDir).toBe(workspace);

      const fieldError = prompter.spinners.find((s) =>
        /missing required fields/i.test(s.erroredWith ?? ''),
      );
      expect(fieldError).toBeDefined();
    } finally {
      rmSync(incomplete, { recursive: true, force: true });
    }
  });

  it('logs an error and re-prompts when no mkdocs.yml exists at or under the given dir', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'empty-'));
    try {
      writeMkdocs(workspace);
      const prompter = createFakePrompter({ path: [empty, workspace] });

      const result = await readProjectDirInteractively(prompter, empty);

      expect(result).not.toBe('cancelled');
      const notFound = prompter.logs.find(
        (l) => l.level === 'error' && /no mkdocs\.yml/i.test(l.message),
      );
      expect(notFound).toBeDefined();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('readProjectDirInteractively — discovery in nested dirs', () => {
  it('confirms a single discovered candidate via the confirm prompt', async () => {
    // mkdocs.yml lives at workspace/website/mkdocs.yml
    const nested = join(workspace, 'website');
    writeMkdocs(nested);
    const prompter = createFakePrompter({
      path: [workspace],
      confirm: [true],
    });

    const result = await readProjectDirInteractively(prompter, workspace);

    expect(result).not.toBe('cancelled');
    if (result === 'cancelled') return;
    expect(result.projectDir).toBe(nested);
    expect(prompter.calls.some((c) => c.kind === 'confirm' && /^use /i.test(c.message))).toBe(true);
  });

  it('treats decline of the single candidate as not-found and re-prompts', async () => {
    const nested = join(workspace, 'website');
    writeMkdocs(nested);
    const fallback = mkdtempSync(join(tmpdir(), 'fallback-'));
    try {
      writeMkdocs(fallback);
      const prompter = createFakePrompter({
        path: [workspace, fallback],
        confirm: [false], // decline the single candidate
      });

      const result = await readProjectDirInteractively(prompter, workspace);

      expect(result).not.toBe('cancelled');
      if (result === 'cancelled') return;
      expect(result.projectDir).toBe(fallback);
    } finally {
      rmSync(fallback, { recursive: true, force: true });
    }
  });

  it('cancels when the user cancels the single-candidate confirm', async () => {
    const nested = join(workspace, 'website');
    writeMkdocs(nested);
    const prompter = createFakePrompter({
      path: [workspace],
      confirm: [null],
    });

    const result = await readProjectDirInteractively(prompter, workspace);

    expect(result).toBe('cancelled');
  });

  it('presents a select prompt when multiple candidates are found and uses the chosen one', async () => {
    const a = join(workspace, 'a');
    const b = join(workspace, 'b');
    writeMkdocs(a);
    writeMkdocs(b);
    const prompter = createFakePrompter({
      path: [workspace],
      // Both relPaths under workspace are candidates; the picker uses select
      // and we accept the initialValue (one of them).
      select: ['a/mkdocs.yml'],
    });

    const result = await readProjectDirInteractively(prompter, workspace);

    expect(result).not.toBe('cancelled');
    if (result === 'cancelled') return;
    expect(result.projectDir).toBe(a);
    expect(prompter.calls.some((c) => c.kind === 'select' && /multiple/i.test(c.message))).toBe(
      true,
    );
  });

  it('cancels when the user cancels the multi-candidate select', async () => {
    writeMkdocs(join(workspace, 'a'));
    writeMkdocs(join(workspace, 'b'));
    const prompter = createFakePrompter({
      path: [workspace],
      select: [null],
    });

    const result = await readProjectDirInteractively(prompter, workspace);

    expect(result).toBe('cancelled');
  });
});
