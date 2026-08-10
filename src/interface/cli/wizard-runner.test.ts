import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import { createFakePrompter } from '../../use-cases/wizard/fake-prompter.js';

const clack = vi.hoisted(() => ({ prompter: null as unknown }));

vi.mock('../../infrastructure/prompts/clack-prompter.js', () => ({
  createClackPrompter: () => clack.prompter,
}));

import { runWizardFlow, type WizardConverter } from './wizard-runner.js';

const created: string[] = [];
let stdoutTtyDescriptor: PropertyDescriptor | undefined;
let stdinTtyDescriptor: PropertyDescriptor | undefined;
let originalCi: string | undefined;

async function project(config = 'site_name: Demo\ndocs_dir: docs\n'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mkdocs-starlight-wizard-'));
  created.push(root);
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'mkdocs.yml'), config, 'utf8');
  await writeFile(join(root, 'docs', 'index.md'), '# Home\n', 'utf8');
  return root;
}

function usePrompter(prompter: Prompter): void {
  clack.prompter = prompter;
}

beforeEach(() => {
  stdoutTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  stdinTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  originalCi = process.env.CI;
  delete process.env.CI;
});

afterEach(async () => {
  if (stdoutTtyDescriptor) Object.defineProperty(process.stdout, 'isTTY', stdoutTtyDescriptor);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
  if (stdinTtyDescriptor) Object.defineProperty(process.stdin, 'isTTY', stdinTtyDescriptor);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (originalCi === undefined) delete process.env.CI;
  else process.env.CI = originalCi;
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('runWizardFlow', () => {
  it('returns non-interactive before loading the prompt driver when no TTY is available', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    clack.prompter = null;

    await expect(
      runWizardFlow('/unused', { stdout: vi.fn(), stderr: vi.fn() }, vi.fn()),
    ).resolves.toEqual({ kind: 'non-interactive' });
  });

  it('cancels cleanly when project confirmation is interrupted', async () => {
    const projectDir = await project();
    const prompter = createFakePrompter({ confirm: [null] });
    usePrompter(prompter);

    const result = await runWizardFlow(projectDir, { stdout: vi.fn(), stderr: vi.fn() }, vi.fn());

    expect(result).toEqual({ kind: 'cancelled' });
  });

  it('completes a fresh wizard run, persists flags, and prints the report', async () => {
    const projectDir = await project();
    await writeFile(join(projectDir, 'yarn.lock'), '', 'utf8');
    const outputDir = join(projectDir, 'generated');
    const prompter = createFakePrompter({
      confirm: [true, true],
      text: [outputDir],
      select: ['yarn', 'c'],
    });
    usePrompter(prompter);
    const stdout = vi.fn();
    const converter: WizardConverter = vi.fn(async () => ({
      kind: 'ok' as const,
      exitCode: 0,
      report: 'clean report',
    }));

    const result = await runWizardFlow(projectDir, { stdout, stderr: vi.fn() }, converter);

    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      expect(result.exitCode).toBe(0);
      expect(result.command.outputDir).toBe(outputDir);
      expect(result.equivalentFlags).toContain('--check');
      expect(result.equivalentFlags).toContain('--package-manager=yarn');
    }
    expect(
      prompter.calls.find((call) => call.kind === 'select' && call.message === 'Package manager')
        ?.initialValue,
    ).toBe('yarn');
    expect(stdout).toHaveBeenCalledWith('clean report');
    expect(prompter.spinners.at(-1)).toMatchObject({ stoppedWith: 'Converted' });
  });

  it('surfaces a fatal conversion through the wizard rail', async () => {
    const projectDir = await project();
    const prompter = createFakePrompter({
      confirm: [true, false],
      text: [join(projectDir, 'generated')],
      select: ['pnpm', 'c'],
    });
    usePrompter(prompter);

    const result = await runWizardFlow(
      projectDir,
      { stdout: vi.fn(), stderr: vi.fn() },
      async () => ({ kind: 'fatal', message: 'conversion exploded' }),
    );

    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') expect(result.exitCode).toBe(1);
    expect(prompter.spinners.at(-1)).toMatchObject({ erroredWith: 'conversion exploded' });
  });

  it('reuses saved answers and reports a diagnostic conversion result', async () => {
    const projectDir = await project();
    const outputDir = join(projectDir, 'saved-output');
    const flags = [projectDir, outputDir, '--package-manager=yarn', '--check'];
    await writeFile(
      join(projectDir, '.mkdocs-material-to-starlight.json'),
      `${JSON.stringify({ version: 1, flags })}\n`,
      'utf8',
    );
    const prompter = createFakePrompter({ confirm: [true, true] });
    usePrompter(prompter);
    const stdout = vi.fn();

    const result = await runWizardFlow(projectDir, { stdout, stderr: vi.fn() }, async () => ({
      kind: 'ok',
      exitCode: 1,
      report: 'diagnostic report',
    }));

    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      expect(result.exitCode).toBe(1);
      expect(result.equivalentFlags).toEqual(flags);
    }
    expect(stdout).toHaveBeenCalledWith('diagnostic report');
    expect(prompter.spinners.at(-1)).toMatchObject({ stoppedWith: 'Converted with errors' });
    expect(
      prompter.notes.some(
        (note) => note.title === 'Converting your site' && note.body.includes('astro check'),
      ),
    ).toBe(true);
  });

  it('asks before overwriting a saved non-empty output and honors cancellation', async () => {
    const projectDir = await project();
    const outputDir = join(projectDir, 'saved-output');
    await mkdir(outputDir);
    await writeFile(join(outputDir, 'existing.txt'), 'keep me', 'utf8');
    const flags = [projectDir, outputDir, '--package-manager=npm'];
    await writeFile(
      join(projectDir, '.mkdocs-material-to-starlight.json'),
      `${JSON.stringify({ version: 1, flags })}\n`,
      'utf8',
    );
    const prompter = createFakePrompter({ confirm: [true, true, false] });
    usePrompter(prompter);
    const converter = vi.fn();

    const result = await runWizardFlow(projectDir, { stdout: vi.fn(), stderr: vi.fn() }, converter);

    expect(result).toEqual({ kind: 'cancelled' });
    expect(converter).not.toHaveBeenCalled();
  });

  it('adds force after confirming a saved-output overwrite and surfaces fatal conversion', async () => {
    const projectDir = await project();
    const outputDir = join(projectDir, 'saved-output');
    await mkdir(outputDir);
    await writeFile(join(outputDir, 'existing.txt'), 'replaceable', 'utf8');
    const flags = [projectDir, outputDir, '--package-manager=pnpm'];
    await writeFile(
      join(projectDir, '.mkdocs-material-to-starlight.json'),
      `${JSON.stringify({ version: 1, flags })}\n`,
      'utf8',
    );
    const prompter = createFakePrompter({ confirm: [true, true, true] });
    usePrompter(prompter);

    const result = await runWizardFlow(
      projectDir,
      { stdout: vi.fn(), stderr: vi.fn() },
      async () => ({ kind: 'fatal', message: 'saved conversion failed' }),
    );

    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') {
      expect(result.exitCode).toBe(1);
      expect(result.equivalentFlags).toContain('--force');
      expect(result.command.force).toBe(true);
    }
  });

  it('falls back to fresh answers when saved flags no longer parse as a conversion', async () => {
    const projectDir = await project();
    const outputDir = join(projectDir, 'fresh-output');
    await writeFile(
      join(projectDir, '.mkdocs-material-to-starlight.json'),
      `${JSON.stringify({ version: 1, flags: ['--help'] })}\n`,
      'utf8',
    );
    const prompter = createFakePrompter({
      confirm: [true, true, true],
      text: [outputDir],
      select: ['npm', 'c'],
    });
    usePrompter(prompter);

    const result = await runWizardFlow(
      projectDir,
      { stdout: vi.fn(), stderr: vi.fn() },
      async () => ({ kind: 'ok', exitCode: 0, report: 'fresh report' }),
    );

    expect(result.kind).toBe('completed');
    expect(prompter.logs.some((entry) => entry.message.includes('Starting fresh'))).toBe(true);
  });

  it('previews lossy, manual, and unsupported features before conversion', async () => {
    const projectDir = await project(
      [
        'site_name: Featureful',
        'docs_dir: docs',
        'plugins:',
        '  - privacy',
        '  - offline',
        'markdown_extensions:',
        '  - pymdownx.critic',
        '  - pymdownx.keys',
        '',
      ].join('\n'),
    );
    const prompter = createFakePrompter({
      confirm: [true, true],
      text: [join(projectDir, 'generated')],
      select: ['npm', 'c'],
    });
    usePrompter(prompter);

    const result = await runWizardFlow(
      projectDir,
      { stdout: vi.fn(), stderr: vi.fn() },
      async () => ({ kind: 'ok', exitCode: 0, report: 'feature report' }),
    );

    expect(result.kind).toBe('completed');
    expect(prompter.logs.some((entry) => entry.message.includes('feature mapping'))).toBe(true);
    expect(prompter.notes.some((note) => note.title?.includes('lossy translation'))).toBe(true);
    expect(prompter.notes.some((note) => note.title?.includes('manual remediation'))).toBe(true);
    expect(prompter.notes.some((note) => note.title?.includes('manual attention'))).toBe(true);
  });

  it('frames a preflight failure and cancels before prompting for answers', async () => {
    const projectDir = await project('site_name: Demo\ndocs_dir: absent\n');
    const prompter = createFakePrompter({ confirm: [true] });
    usePrompter(prompter);
    const converter = vi.fn();

    const result = await runWizardFlow(projectDir, { stdout: vi.fn(), stderr: vi.fn() }, converter);

    expect(result).toEqual({ kind: 'cancelled' });
    expect(converter).not.toHaveBeenCalled();
    expect(prompter.notes.some((note) => note.title === 'Found a problem with your project')).toBe(
      true,
    );
  });
});
