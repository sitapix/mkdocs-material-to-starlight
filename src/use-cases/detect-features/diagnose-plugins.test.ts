import { describe, expect, it } from 'vitest';
import { diagnosePlugins } from './diagnose-plugins.js';
import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';

function plugins(...names: string[]): ReadonlyArray<MkdocsPlugin> {
  return names.map((name) => ({ name, options: {} }));
}

describe('diagnosePlugins', () => {
  it('returns only the search-replaced info diagnostic when only auto-routed plugins are configured', () => {
    const out = diagnosePlugins(plugins('search', 'glightbox', 'mike'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleId).toBe('plugin-search-replaced');
    expect(out[0]?.severity).toBe('info');
  });

  it('returns no diagnostics when only mike+glightbox are configured (no search)', () => {
    expect(diagnosePlugins(plugins('glightbox', 'mike'))).toEqual([]);
  });

  it('emits a diagnostic for the Material social plugin (no Starlight equivalent)', () => {
    const out = diagnosePlugins(plugins('social'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleId).toBe('plugin-social-no-equivalent');
    expect(out[0]?.severity).toBe('warning');
  });

  it('emits a diagnostic for the meta plugin (folder-scoped frontmatter cascade)', () => {
    const out = diagnosePlugins(plugins('meta'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleId).toBe('plugin-meta-no-equivalent');
  });

  it('emits a diagnostic for the typeset plugin (deprecated by Material)', () => {
    const out = diagnosePlugins(plugins('typeset'));
    expect(out[0]?.ruleId).toBe('plugin-typeset-deprecated');
  });

  it('emits a diagnostic for the privacy plugin', () => {
    const out = diagnosePlugins(plugins('privacy'));
    expect(out[0]?.ruleId).toBe('plugin-privacy-no-equivalent');
  });

  it('emits an info diagnostic for the optimize plugin (subsumed by astro:assets)', () => {
    const out = diagnosePlugins(plugins('optimize'));
    expect(out[0]?.ruleId).toBe('plugin-optimize-subsumed');
    expect(out[0]?.severity).toBe('info');
  });

  it('emits a diagnostic for the projects plugin (deprecated)', () => {
    const out = diagnosePlugins(plugins('projects'));
    expect(out[0]?.ruleId).toBe('plugin-projects-deprecated');
  });

  it('emits a diagnostic for mkdocstrings (Python autodoc — no Starlight path)', () => {
    const out = diagnosePlugins(plugins('mkdocstrings'));
    expect(out[0]?.ruleId).toBe('plugin-mkdocstrings-no-equivalent');
  });

  it('emits a diagnostic for mkdocs-jupyter', () => {
    const out = diagnosePlugins(plugins('mkdocs-jupyter'));
    expect(out[0]?.ruleId).toBe('plugin-jupyter-no-equivalent');
  });

  it('emits an info diagnostic for the i18n plugin (rename done; locales config still manual)', () => {
    const out = diagnosePlugins(plugins('i18n'));
    expect(out[0]?.ruleId).toBe('plugin-i18n-needs-rename');
    expect(out[0]?.severity).toBe('info');
    expect(out[0]?.message).toContain('locales');
  });

  it('handles multiple unmappable plugins in one pass, preserving order', () => {
    const out = diagnosePlugins(plugins('social', 'typeset'));
    expect(out).toHaveLength(2);
    expect(out[0]?.ruleId).toBe('plugin-social-no-equivalent');
    expect(out[1]?.ruleId).toBe('plugin-typeset-deprecated');
  });

  it('does not emit diagnostics for plugins that have a clean substitute', () => {
    expect(diagnosePlugins(plugins('blog'))).toEqual([]);
    expect(diagnosePlugins(plugins('tags'))).toEqual([]);
    expect(diagnosePlugins(plugins('mike'))).toEqual([]);
    expect(diagnosePlugins(plugins('glightbox'))).toEqual([]);
  });

  it('emits an info diagnostic for mkdocs-swagger-ui-tag mapped to starlight-openapi', () => {
    const out = diagnosePlugins(plugins('mkdocs-swagger-ui-tag'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleId).toBe('plugin-swagger-ui-mapped');
    expect(out[0]?.severity).toBe('info');
    expect(out[0]?.message).toContain('starlight-openapi');
    expect(out[0]?.message).toContain('starlight-openapi.vercel.app');
  });

  it('emits an info diagnostic for the alternate swagger-ui-tag name', () => {
    const out = diagnosePlugins(plugins('swagger-ui-tag'));
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleId).toBe('plugin-swagger-ui-mapped');
  });

  it('deduplicates swagger-ui-tag diagnostic when both plugin names appear', () => {
    const out = diagnosePlugins(plugins('mkdocs-swagger-ui-tag', 'swagger-ui-tag'));
    const swaggerDiags = out.filter((d) => d.ruleId === 'plugin-swagger-ui-mapped');
    expect(swaggerDiags).toHaveLength(1);
  });
});
