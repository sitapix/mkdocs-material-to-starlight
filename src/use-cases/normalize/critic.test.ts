import { describe, expect, it } from 'vitest';
import { normalizeCriticMarkup } from './critic.js';

describe('normalizeCriticMarkup', () => {
  it('passes through text containing no Critic Markup tokens', () => {
    const src = '# Heading\n\nA plain paragraph.\n';
    expect(normalizeCriticMarkup(src)).toBe(src);
  });

  it('rewrites {++added++} into <ins>added</ins>', () => {
    expect(normalizeCriticMarkup('Text {++added++} here.\n')).toBe('Text <ins>added</ins> here.\n');
  });

  it('rewrites {--deleted--} into <del>deleted</del>', () => {
    expect(normalizeCriticMarkup('Text {--deleted--} here.\n')).toBe(
      'Text <del>deleted</del> here.\n',
    );
  });

  it('rewrites {==highlighted==} into <mark>highlighted</mark>', () => {
    expect(normalizeCriticMarkup('Text {==highlighted==} here.\n')).toBe(
      'Text <mark>highlighted</mark> here.\n',
    );
  });

  it('rewrites {>>comment<<} into <span class="critic-comment">comment</span>', () => {
    expect(normalizeCriticMarkup('Text {>>note<<} here.\n')).toBe(
      'Text <span class="critic-comment">note</span> here.\n',
    );
  });

  it('rewrites {~~old~>new~~} as paired <del>old</del><ins>new</ins>', () => {
    expect(normalizeCriticMarkup('Text {~~old~>new~~} here.\n')).toBe(
      'Text <del>old</del><ins>new</ins> here.\n',
    );
  });

  it('handles multiple Critic tokens in one document', () => {
    const src = '{++inserted++} and {--deleted--} and {==marked==}.\n';
    expect(normalizeCriticMarkup(src)).toBe(
      '<ins>inserted</ins> and <del>deleted</del> and <mark>marked</mark>.\n',
    );
  });

  it('does not rewrite Critic markers inside fenced code', () => {
    const src = ['```', '{++added++}', '```', ''].join('\n');
    expect(normalizeCriticMarkup(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = 'Text {++added++} and {==marked==} together.\n';
    const once = normalizeCriticMarkup(src);
    expect(normalizeCriticMarkup(once)).toBe(once);
  });

  it('does not consume the inner == of {==text==} when bare ==text== sits elsewhere', () => {
    const src = 'Critic {==important==} and bare ==also==.\n';
    const out = normalizeCriticMarkup(src);
    expect(out).toContain('<mark>important</mark>');
    expect(out).toContain('==also==');
  });

  it('rewrites a multi-paragraph {== … ==} highlight (crafty-documentation regression)', () => {
    // Real-world: crafty-documentation/macos.md uses Critic to highlight
    // a multi-paragraph note. A line-by-line normalizer cannot match
    // `{==\n\nbody\n\n==}` because the regex never sees both delimiters
    // at once. The opening `{==` then leaks into MDX where acorn rejects
    // it with "Could not parse expression."
    const src = [
      'Some intro.',
      '',
      '{==',
      '',
      'The command above runs and you will see progress.',
      '',
      '==}',
      '',
      'Closing text.',
      '',
    ].join('\n');
    const out = normalizeCriticMarkup(src);
    expect(out).toContain('<mark>');
    expect(out).toContain('</mark>');
    expect(out).not.toContain('{==');
    expect(out).not.toContain('==}');
  });

  it('does not match a critic span split by a fenced code block', () => {
    // Spans must NOT cross fences — fence shielding is preserved by the
    // per-block batching strategy.
    const src = ['{==', '```', 'literal inside code', '```', '==}', ''].join('\n');
    const out = normalizeCriticMarkup(src);
    expect(out).toContain('{==');
    expect(out).toContain('==}');
  });
});
