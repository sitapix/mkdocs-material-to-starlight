import { describe, expect, it } from 'vitest';
import { normalizeFancylists } from './fancylists.js';

describe('normalizeFancylists', () => {
  it('returns input unchanged when no Roman or alpha markers are present', () => {
    const src = '1. one\n2. two\n3. three\n';
    expect(normalizeFancylists(src)).toBe(src);
  });

  it('promotes lowercase Roman numerals to <ol type="i">', () => {
    const src = 'i. first\nii. second\niii. third\n';
    const out = normalizeFancylists(src);
    expect(out).toContain('<ol type="i">');
    expect(out).toContain('<li>first</li>');
    expect(out).toContain('<li>second</li>');
    expect(out).toContain('<li>third</li>');
    expect(out).toContain('</ol>');
  });

  it('promotes uppercase Roman numerals to <ol type="I">', () => {
    const src = 'I.  first\nII.  second\nIII.  third\n';
    const out = normalizeFancylists(src);
    expect(out).toContain('<ol type="I">');
  });

  it('promotes lowercase alpha (a. b. c.) to <ol type="a">', () => {
    const src = 'a. apple\nb. banana\nc. cherry\n';
    const out = normalizeFancylists(src);
    expect(out).toContain('<ol type="a">');
    expect(out).toContain('<li>apple</li>');
  });

  it('promotes uppercase alpha (A.  B.) to <ol type="A">', () => {
    const src = 'A.  alpha\nB.  beta\nC.  gamma\n';
    const out = normalizeFancylists(src);
    expect(out).toContain('<ol type="A">');
  });

  it('does not touch ordinary decimal lists', () => {
    const src = '1. one\n2. two\n';
    expect(normalizeFancylists(src)).toBe(src);
  });

  it('does not match content inside fenced code blocks', () => {
    const src = '```\ni. ignored\nii. also ignored\n```\n';
    expect(normalizeFancylists(src)).toBe(src);
  });

  it('idempotent: running twice yields the same output', () => {
    const src = 'i. one\nii. two\n';
    const once = normalizeFancylists(src);
    const twice = normalizeFancylists(once);
    expect(twice).toBe(once);
  });

  it('preserves prose content before and after the list', () => {
    const src = 'Intro paragraph.\n\ni. first\nii. second\n\nOutro paragraph.\n';
    const out = normalizeFancylists(src);
    expect(out).toContain('Intro paragraph.');
    expect(out).toContain('Outro paragraph.');
    expect(out).toContain('<ol type="i">');
  });

  it('does not match a single line (needs >= 2 items to be a fancy list)', () => {
    const src = 'i. solitary\n';
    expect(normalizeFancylists(src)).toBe(src);
  });

  it('uppercase single-letter alpha requires two spaces (per pymdownx.fancylists)', () => {
    // "A. Smith" with one space is treated as initials, not a list, per the
    // PyMdown spec. Two spaces flips it to a list.
    const src = 'A. Smith works here\nB. Jones too\n';
    expect(normalizeFancylists(src)).toBe(src);
  });
});
