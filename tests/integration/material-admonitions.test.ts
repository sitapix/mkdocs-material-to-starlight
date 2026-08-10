import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function convert(source: string): Promise<string> {
  const project = mkdtempSync(join(tmpdir(), 'mts-material-admonitions-'));
  const output = mkdtempSync(join(tmpdir(), 'mts-material-admonitions-out-'));
  cleanup.push(project, output);
  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(join(project, 'mkdocs.yml'), 'site_name: Admonitions\ntheme: { name: material }\n');
  writeFileSync(join(project, 'docs', 'index.md'), source);
  const result = await convertSiteFromDisk({ projectDir: project, outputDir: output });
  if (!result.ok) throw new Error(result.error.message);
  return output;
}

describe('Astro 7-native Material admonitions', () => {
  it('generates and wires a local remark plugin without deprecated packages', async () => {
    const output = await convert('# Home\n\n!!! abstract "Summary"\n    Preserved body.\n');

    expect(readFileSync(join(output, 'src/content/docs/index.md'), 'utf8')).toContain(
      ':::abstract[Summary]',
    );
    expect(existsSync(join(output, 'src/plugins/material-admonitions.mjs'))).toBe(true);

    const config = readFileSync(join(output, 'astro.config.mjs'), 'utf8');
    expect(config).toContain(
      "import remarkMaterialAdmonitions from './src/plugins/material-admonitions.mjs';",
    );
    expect(config).toContain('remarkPlugins: [remarkMaterialAdmonitions]');
    expect(config).not.toContain('starlight-markdown-blocks');

    const pkg = JSON.parse(readFileSync(join(output, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toHaveProperty('unist-util-visit');
    expect(pkg.dependencies).not.toHaveProperty('starlight-markdown-blocks');
  });

  it('does not generate the plugin when the site uses only built-in aside types', async () => {
    const output = await convert('# Home\n\n!!! note "Notice"\n    Built in.\n');
    expect(existsSync(join(output, 'src/plugins/material-admonitions.mjs'))).toBe(false);
    expect(readFileSync(join(output, 'astro.config.mjs'), 'utf8')).not.toContain(
      'remarkMaterialAdmonitions',
    );
  });
});
