import { describe, expect, it } from 'vitest';
import { scanButtonIcons } from './scan-button-icons.js';

describe('scanButtonIcons', () => {
  it('returns no diagnostic for source with no buttons', () => {
    expect(scanButtonIcons('# Heading\n\nA paragraph.\n')).toHaveLength(0);
  });

  it('returns no diagnostic for a button with no icon shortcode', () => {
    const src = '[Subscribe](#){ .md-button }\n';
    expect(scanButtonIcons(src)).toHaveLength(0);
  });

  it('returns no diagnostic when the button icon resolves to a Starlight built-in', () => {
    // `material-rocket` is in the curated icon map.
    const src = '[Launch :material-rocket:](#){ .md-button .md-button--primary }\n';
    expect(scanButtonIcons(src)).toHaveLength(0);
  });

  it('emits one info diagnostic when a button icon does not resolve to a Starlight built-in', () => {
    // `fontawesome-solid-totally-made-up` falls through to local-svg.
    const src = '[Click :fontawesome-solid-totally-made-up:](#){ .md-button }\n';
    const diags = scanButtonIcons(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('button-icon-stripped');
    expect(diags[0]?.severity).toBe('info');
    expect(diags[0]?.message).toMatch(/totally-made-up/);
  });

  it('emits one diagnostic per file even when many buttons have unmapped icons', () => {
    const src = [
      '[A :foo-unmapped-one:](#){ .md-button }',
      '[B :foo-unmapped-two:](#){ .md-button }',
      '[C :foo-unmapped-three:](#){ .md-button }',
      '',
    ].join('\n');
    const diags = scanButtonIcons(src);
    expect(diags).toHaveLength(1);
    // The single diagnostic should mention all three shortcodes for traceability.
    expect(diags[0]?.message).toMatch(/foo-unmapped-one/);
    expect(diags[0]?.message).toMatch(/foo-unmapped-two/);
    expect(diags[0]?.message).toMatch(/foo-unmapped-three/);
  });

  it('does not flag icons inside fenced code blocks', () => {
    const src = ['```', '[X :foo-unmapped:](#){ .md-button }', '```', ''].join('\n');
    expect(scanButtonIcons(src)).toHaveLength(0);
  });

  it('does not flag icons that map via known icon-set prefix to a Starlight builtin', () => {
    // `fontawesome-brands-github` IS in the curated map → resolves to 'github'.
    const src = '[Repo :fontawesome-brands-github:](#){ .md-button }\n';
    expect(scanButtonIcons(src)).toHaveLength(0);
  });
});
