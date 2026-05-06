#!/usr/bin/env node
/**
 * Regenerate the converter's expected outputs for the real-world
 * fixture corpus under `tests/fixtures/real-world/`.
 *
 *   npm run regen-fixtures             # all fixtures
 *   npm run regen-fixtures -- httpx    # one fixture
 *
 * Each `<name>/` source tree paired with `<name>-out/` (or
 * `<name>-en-out/` for fastapi, which has the locale subdir convention)
 * is detected automatically: any directory that contains a `mkdocs.yml`
 * with a sibling `<name>-out*` is treated as a fixture pair.
 *
 * The script does not commit. Review the diff, sanity-check, and
 * commit intentionally — see `tests/fixtures/real-world/README.md`.
 */
import { readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertSiteFromDisk } from '../dist/interface/api/index.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..');
const CORPUS = join(ROOT, 'tests', 'fixtures', 'real-world');

function discoverFixtures() {
  const entries = readdirSync(CORPUS).filter((name) => {
    if (name.endsWith('-out') || name.includes('-out-') || name.endsWith('-out-A')) {
      return false;
    }
    const full = join(CORPUS, name);
    if (!statSync(full).isDirectory()) return false;
    return existsSync(join(full, 'mkdocs.yml'));
  });
  return entries.map((name) => {
    const sourceDir = join(CORPUS, name);
    const candidates = [
      join(CORPUS, `${name}-out`),
      join(CORPUS, `${name}-en-out`),
    ];
    const outputDir = candidates.find((c) => existsSync(c)) ?? candidates[0];
    return { name, sourceDir, outputDir };
  });
}

async function regen(fixture) {
  console.log(`→ ${fixture.name}`);
  if (existsSync(fixture.outputDir)) {
    rmSync(fixture.outputDir, { recursive: true, force: true });
  }
  const result = await convertSiteFromDisk({
    projectDir: fixture.sourceDir,
    outputDir: fixture.outputDir,
    force: true,
  });
  if (!result.ok) {
    console.error(`  ✗ ${result.error.code}: ${result.error.message}`);
    return false;
  }
  const diagCount = result.value.diagnostics.length;
  console.log(`  ✓ ${diagCount} diagnostic${diagCount === 1 ? '' : 's'}`);
  return true;
}

const filter = process.argv[2];
const all = discoverFixtures();
const targeted = filter === undefined ? all : all.filter((f) => f.name === filter);
if (filter !== undefined && targeted.length === 0) {
  console.error(`error: no fixture named "${filter}". Known fixtures:`);
  for (const f of all) console.error(`  - ${f.name}`);
  process.exit(2);
}
let ok = 0;
let failed = 0;
for (const fixture of targeted) {
  if (await regen(fixture)) ok++;
  else failed++;
}
console.log(`done — ${ok} regenerated, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
