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

describe('formatRecap — friendly enum labels', () => {
  // Regression: the recap used to print raw enum strings (`palette: translate`,
  // `tabs: mdx`) which mismatched the option labels the user just answered
  // ("Translate to Starlight accent", "Promote to MDX as needed"). The recap
  // should mirror what the user just confirmed, not the internal value.
  it('renders palette enum as a human phrase', () => {
    const text = formatRecap(recapWith({ tier1: { palette: 'translate' } }));
    expect(text).toMatch(/palette:\s*translate Material accent/i);
  });

  it('renders palette `skip` and `custom` with friendly phrases too', () => {
    const skipped = formatRecap(recapWith({ tier1: { palette: 'skip' } }));
    expect(skipped).toMatch(/palette:\s*Starlight default accent/i);

    const custom = formatRecap(recapWith({ tier1: { palette: 'custom' } }));
    expect(custom).toMatch(/palette:\s*custom CSS/i);
  });

  it('renders tabs enum as a human phrase', () => {
    const mdx = formatRecap(recapWith({ tier1: { tabs: 'mdx' } }));
    expect(mdx).toMatch(/tabs:\s*promote to MDX/i);

    const md = formatRecap(recapWith({ tier1: { tabs: 'html' } }));
    expect(md).toMatch(/tabs:\s*raw HTML/i);
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

describe('formatRecap — highlighter', () => {
  it('applies the value highlighter to user-chosen values, not labels', () => {
    const text = formatRecap(
      recapWith({
        tier0: { ...baseTier0, packageManager: 'pnpm', check: false },
        tier1: { tabs: 'mdx' },
      }),
      { value: (s) => `<<${s}>>` },
    );
    // Labels (`from:`, `to:`, `package manager:`, `tabs:`) stay plain so the
    // prompt rail is scannable; only the chosen values are wrapped.
    expect(text).toContain('from: <</abs/project>>');
    expect(text).toContain('to:   <<./my-docs-starlight>>');
    expect(text).toContain('package manager: <<pnpm>>');
    // The value is rendered as a friendly phrase, not the raw enum, but the
    // highlighter still wraps the whole thing.
    expect(text).toMatch(/tabs:\s*<<promote to MDX[^>]*>>/);
    expect(text).not.toContain('<<from:');
  });

  it('defaults to identity when no highlighter is provided (plain output)', () => {
    const text = formatRecap(recapWith({ tier1: { tabs: 'mdx' } }));
    expect(text).toMatch(/tabs:\s*promote to MDX/);
    expect(text).not.toContain('<<');
  });
});
