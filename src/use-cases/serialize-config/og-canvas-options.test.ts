import { describe, expect, it } from 'vitest';
import { translateOgCanvasOptions } from './og-canvas-options.js';

describe('translateOgCanvasOptions', () => {
  it('returns empty object literal when no Material cards_layout_options present', () => {
    const out = translateOgCanvasOptions({});
    expect(out).toBe('{}');
  });

  it('translates background_color to bgGradient', () => {
    const out = translateOgCanvasOptions({
      background_color: '#1a1a2e',
    });
    expect(out).toContain("bgGradient: ['#1a1a2e']");
  });

  it('translates color (foreground) into per-element color overrides', () => {
    const out = translateOgCanvasOptions({ color: '#ffffff' });
    expect(out).toContain("color: '#ffffff'");
  });

  it('translates font_family to font.title.family', () => {
    const out = translateOgCanvasOptions({ font_family: 'Roboto' });
    expect(out).toContain('font:');
    expect(out).toContain('title:');
    expect(out).toContain("families: ['Roboto']");
  });

  it('translates background_image to bgImage', () => {
    const out = translateOgCanvasOptions({ background_image: 'assets/bg.png' });
    expect(out).toContain('bgImage:');
    expect(out).toContain("'assets/bg.png'");
  });

  it('translates logo to logo.path', () => {
    const out = translateOgCanvasOptions({ logo: 'assets/logo.svg' });
    expect(out).toContain('logo:');
    expect(out).toContain("path: ['assets/logo.svg']");
  });

  it('emits a single JS object literal', () => {
    const out = translateOgCanvasOptions({
      background_color: '#000',
      color: '#fff',
      font_family: 'Inter',
    });
    expect(out.startsWith('{')).toBe(true);
    expect(out.endsWith('}')).toBe(true);
  });

  it('idempotent', () => {
    const opts = { background_color: '#000', color: '#fff' };
    expect(translateOgCanvasOptions(opts)).toBe(translateOgCanvasOptions(opts));
  });

  it('escapes single quotes in string values', () => {
    const out = translateOgCanvasOptions({ logo: "it's/logo.svg" });
    expect(out).toContain("'it\\'s/logo.svg'");
  });
});
