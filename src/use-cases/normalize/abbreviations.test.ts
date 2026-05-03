import { describe, expect, it } from 'vitest';
import { normalizeAbbreviations } from './abbreviations.js';

describe('normalizeAbbreviations', () => {
  it('passes through text containing no abbreviation definitions', () => {
    const src = '# Heading\n\nA plain paragraph with HTML and CSS.\n';
    expect(normalizeAbbreviations(src)).toBe(src);
  });

  it('removes the definition line and wraps the term with <abbr title>', () => {
    const src = [
      'The HTML specification is maintained by the W3C.',
      '',
      '*[HTML]: Hyper Text Markup Language',
      '',
    ].join('\n');
    const out = normalizeAbbreviations(src);
    expect(out).toContain(
      'The <abbr title="Hyper Text Markup Language">HTML</abbr> specification',
    );
    expect(out).not.toContain('*[HTML]:');
  });

  it('wraps every occurrence of the term, not just the first', () => {
    const src = [
      'HTML is a markup language. HTML is everywhere. We love HTML.',
      '',
      '*[HTML]: Hyper Text Markup Language',
      '',
    ].join('\n');
    const out = normalizeAbbreviations(src);
    const matches = out.match(/<abbr [^>]*>HTML<\/abbr>/g) ?? [];
    expect(matches.length).toBe(3);
  });

  it('handles multiple definitions in the same document', () => {
    const src = [
      'HTML and CSS work together with W3C.',
      '',
      '*[HTML]: Hyper Text Markup Language',
      '*[CSS]: Cascading Style Sheets',
      '*[W3C]: World Wide Web Consortium',
      '',
    ].join('\n');
    const out = normalizeAbbreviations(src);
    expect(out).toContain('<abbr title="Hyper Text Markup Language">HTML</abbr>');
    expect(out).toContain('<abbr title="Cascading Style Sheets">CSS</abbr>');
    expect(out).toContain('<abbr title="World Wide Web Consortium">W3C</abbr>');
    expect(out).not.toContain('*[HTML]:');
    expect(out).not.toContain('*[CSS]:');
    expect(out).not.toContain('*[W3C]:');
  });

  it('respects whole-word boundaries — does not wrap inside larger words', () => {
    const src = [
      'CSS is great. PostCSS is a postprocessor for CSS.',
      '',
      '*[CSS]: Cascading Style Sheets',
      '',
    ].join('\n');
    const out = normalizeAbbreviations(src);
    expect(out).toContain('<abbr title="Cascading Style Sheets">CSS</abbr> is great.');
    expect(out).toContain('PostCSS is a postprocessor');
    expect(out).not.toContain('Post<abbr');
  });

  it('does not rewrite term inside fenced code', () => {
    const src = [
      '```',
      'HTML',
      '```',
      '',
      '*[HTML]: Hyper Text Markup Language',
      '',
    ].join('\n');
    const out = normalizeAbbreviations(src);
    expect(out).toContain('```\nHTML\n```');
    expect(out).not.toContain('<abbr');
  });

  it('is idempotent — running twice equals running once', () => {
    const src = [
      'HTML is a markup language.',
      '',
      '*[HTML]: Hyper Text Markup Language',
      '',
    ].join('\n');
    const once = normalizeAbbreviations(src);
    expect(normalizeAbbreviations(once)).toBe(once);
  });
});
