import { describe, expect, it } from 'vitest';
import { extractLabelIcon } from './extract-label-icon.js';

describe('extractLabelIcon', () => {
  it('returns the original label when no shortcode is present', () => {
    expect(extractLabelIcon({ rawLabel: 'Python' })).toEqual({
      iconName: null,
      label: 'Python',
    });
  });

  it('promotes a curated FontAwesome shortcode to the Starlight icon name', () => {
    expect(extractLabelIcon({ rawLabel: ':fontawesome-brands-python: Python' })).toEqual({
      iconName: 'seti:python',
      label: 'Python',
    });
  });

  it('strips an unmapped icon-set shortcode and emits a null icon', () => {
    // fontawesome-brands-rust resolves to a local-svg descriptor — there is
    // no built-in Starlight name for it, so we strip without emitting.
    expect(extractLabelIcon({ rawLabel: ':fontawesome-brands-rust: Rust' })).toEqual({
      iconName: null,
      label: 'Rust',
    });
  });

  it('honors a user-supplied override map', () => {
    const result = extractLabelIcon({
      rawLabel: ':fontawesome-brands-rust: Rust',
      overrides: { 'fontawesome-brands-rust': 'starlight' },
    });
    expect(result).toEqual({ iconName: 'starlight', label: 'Rust' });
  });

  it('leaves a non-shortcode-shaped colon group alone', () => {
    // Bare `:foo:` (no hyphen) is not icon-shaped. Pass through.
    expect(extractLabelIcon({ rawLabel: ':not-an-icon-shape Title' })).toEqual({
      iconName: null,
      label: ':not-an-icon-shape Title',
    });
  });

  it('keeps a label clean when the shortcode is mid-string', () => {
    expect(extractLabelIcon({ rawLabel: 'Run :material-rocket: it' })).toMatchObject({
      label: 'Run it',
    });
  });

  it('extracts only the first shortcode when several appear', () => {
    const result = extractLabelIcon({
      rawLabel: ':fontawesome-brands-python: A :fontawesome-brands-python: B',
    });
    // Only the first is consumed; the second remains in the label.
    expect(result.iconName).toBe('seti:python');
    expect(result.label).toBe('A :fontawesome-brands-python: B');
  });
});
