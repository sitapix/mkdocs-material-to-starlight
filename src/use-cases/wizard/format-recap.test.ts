import { describe, expect, it } from 'vitest';
import { formatRecap, type RecapInput } from './format-recap.js';

const baseTier0 = {
  outputDir: './my-docs-starlight',
  packageManager: 'npm' as const,
  check: false,
};

function recapWith(over: Partial<RecapInput> = {}): RecapInput {
  return {
    projectDir: '/abs/project',
    tier0: baseTier0,
    tier1: {},
    ...over,
  };
}

describe('formatRecap — header', () => {
  it('shows projectDir and outputDir on dedicated lines', () => {
    const text = formatRecap(recapWith());
    expect(text).toMatch(/from\s*:\s*\/abs\/project/);
    expect(text).toMatch(/to\s*:\s*\.\/my-docs-starlight/);
  });
});

describe('formatRecap — Tier 0 mandatory choices', () => {
  it('shows the package manager', () => {
    expect(formatRecap(recapWith({ tier0: { ...baseTier0, packageManager: 'pnpm' } }))).toMatch(
      /pnpm/,
    );
  });

  it('mentions astro check when enabled', () => {
    expect(formatRecap(recapWith({ tier0: { ...baseTier0, check: true } }))).toMatch(
      /astro check/i,
    );
  });

  it('does not mention astro check when disabled', () => {
    expect(formatRecap(recapWith({ tier0: { ...baseTier0, check: false } }))).not.toMatch(
      /astro check/i,
    );
  });
});

describe('formatRecap — Tier 1 conditional decisions', () => {
  it('lists tabs strategy when tier1.tabs is set', () => {
    const text = formatRecap(recapWith({ tier1: { tabs: 'mdx' } }));
    expect(text).toMatch(/tabs.*mdx/i);
  });

  it('lists sidebar split when tier1.sidebarTopics is true', () => {
    const text = formatRecap(recapWith({ tier1: { sidebarTopics: true } }));
    expect(text).toMatch(/sidebar/i);
  });

  it('does not list sidebar split when tier1.sidebarTopics is false', () => {
    const text = formatRecap(recapWith({ tier1: { sidebarTopics: false } }));
    expect(text).not.toMatch(/sidebar.*split|split.*sidebar/i);
  });

  it('summarizes locale count when tier1.locales is non-empty (avoid wall-of-text)', () => {
    const text = formatRecap(recapWith({ tier1: { locales: ['en', 'de', 'fr', 'ja', 'zh'] } }));
    expect(text).toMatch(/5 locales/);
    // The full list isn't dumped — just the count + first few.
    expect(text).not.toContain('en, de, fr, ja, zh');
  });

  it('summarizes extra-asset count when tier1.extraAssets is non-empty', () => {
    const text = formatRecap(recapWith({ tier1: { extraAssets: ['extra.css', 'tweaks.js'] } }));
    expect(text).toMatch(/2 extra (asset|asset)/i);
  });

  it('omits sections for tier1 fields the user was not asked about', () => {
    const text = formatRecap(recapWith({ tier1: {} }));
    expect(text).not.toMatch(/tabs/i);
    expect(text).not.toMatch(/locale/i);
    expect(text).not.toMatch(/extra/i);
  });
});

describe('formatRecap — output is human-scannable', () => {
  it('uses one fact per line so the user can skim before pressing Enter', () => {
    const text = formatRecap(
      recapWith({
        tier0: { ...baseTier0, packageManager: 'pnpm', check: true },
        tier1: { tabs: 'mdx', sidebarTopics: true, rss: true },
      }),
    );
    const lines = text.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });
});
