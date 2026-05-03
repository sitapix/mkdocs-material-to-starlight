import { describe, expect, it } from 'vitest';
import { serializeStyleSheet } from './styles.js';

describe('serializeStyleSheet', () => {
  it('produces non-empty CSS source', () => {
    const out = serializeStyleSheet();
    expect(out.length).toBeGreaterThan(0);
  });

  it('declares grid CSS classes used by the AST grid transformer', () => {
    const out = serializeStyleSheet();
    expect(out).toContain('.sl-card-grid');
    expect(out).toContain('.sl-card');
    expect(out).toContain('.sl-grid');
  });

  it('declares tab CSS classes used by the AST tabs transformer', () => {
    const out = serializeStyleSheet();
    expect(out).toContain('.sl-tabs');
    expect(out).toContain('.sl-tab');
  });

  it('uses display: grid for the grid containers', () => {
    const out = serializeStyleSheet();
    expect(out).toMatch(/\.sl-card-grid\s*{[^}]*display:\s*grid/);
  });

  it('starts with a comment identifying the source', () => {
    const out = serializeStyleSheet();
    expect(out.trimStart().startsWith('/*')).toBe(true);
    expect(out).toContain('mkdocs-to-starlight');
  });

  it('emits no palette block when palette is undefined', () => {
    const out = serializeStyleSheet();
    expect(out).not.toContain('--sl-hue-accent');
  });

  it('appends a :root block with --sl-hue-accent when palette supplied', () => {
    const out = serializeStyleSheet({
      accentHue: 350,
      accentChroma: 0.18,
      isCustom: false,
      sourceName: 'pink',
    });
    expect(out).toContain('--sl-hue-accent: 350');
    expect(out).toContain('--sl-color-accent');
    expect(out).toContain('pink');
  });

  it('emits a dark-theme override block', () => {
    const out = serializeStyleSheet({
      accentHue: 250,
      accentChroma: 0.18,
      isCustom: false,
      sourceName: 'blue',
    });
    expect(out).toContain("[data-theme='dark']");
  });

  it('omits palette block when isCustom is true (caller emits diagnostic)', () => {
    const out = serializeStyleSheet({
      accentHue: 0,
      accentChroma: 0,
      isCustom: true,
      sourceName: 'custom',
    });
    expect(out).not.toContain('--sl-hue-accent');
  });

  it('uses the slate-scheme hue inside [data-theme=dark] when darkAccentHue is set', () => {
    const out = serializeStyleSheet({
      accentHue: 270, // indigo
      accentChroma: 0.18,
      isCustom: false,
      sourceName: 'indigo',
      darkAccentHue: 75, // amber
      darkAccentChroma: 0.18,
      darkSourceName: 'amber',
    });
    // Light mode uses indigo
    expect(out).toMatch(/:root\s*{[^}]*--sl-hue-accent:\s*270/);
    // Dark block uses amber, not indigo
    expect(out).toMatch(/\[data-theme='dark'\][^{]*{[\s\S]*?75/);
    expect(out).toContain('amber');
  });

  it('falls back to the primary hue inside [data-theme=dark] when no slate scheme is provided', () => {
    const out = serializeStyleSheet({
      accentHue: 250,
      accentChroma: 0.18,
      isCustom: false,
      sourceName: 'blue',
    });
    // Both blocks use the same hue
    const hueMatches = [...out.matchAll(/250/g)];
    expect(hueMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('emits --sl-font and --sl-font-mono overrides when fonts are supplied', () => {
    const out = serializeStyleSheet(null, {
      text: { family: 'Roboto', package: '@fontsource/roboto' },
      code: { family: 'JetBrains Mono', package: '@fontsource/jetbrains-mono' },
    });
    expect(out).toMatch(/--sl-font:\s*['"]Roboto['"]/);
    expect(out).toMatch(/--sl-font-mono:\s*['"]JetBrains Mono['"]/);
  });

  it('emits only the configured font (no orphaned --sl-font-mono when only text is set)', () => {
    const out = serializeStyleSheet(null, {
      text: { family: 'Inter', package: '@fontsource/inter' },
    });
    expect(out).toContain('--sl-font:');
    expect(out).not.toContain('--sl-font-mono:');
  });

  it('emits no font block when fonts are null', () => {
    const out = serializeStyleSheet(null, null);
    expect(out).not.toContain('--sl-font:');
    expect(out).not.toContain('--sl-font-mono:');
  });
});
