import { describe, expect, it } from 'vitest';
import { normalizeStandardEmoji } from './emoji.js';

describe('normalizeStandardEmoji', () => {
  it('returns source unchanged when no shortcodes', () => {
    expect(normalizeStandardEmoji('Plain text\n')).toBe('Plain text\n');
  });

  it('replaces :smile: with the actual glyph', () => {
    expect(normalizeStandardEmoji('Hello :smile:')).toBe('Hello 😄');
  });

  it('replaces :rocket:, :tada:, :fire:, :heart:', () => {
    const out = normalizeStandardEmoji(':rocket: :tada: :fire: :heart:');
    expect(out).toBe('🚀 🎉 🔥 ❤️');
  });

  it('does NOT replace :material-foo: icon shortcodes', () => {
    expect(normalizeStandardEmoji(':material-rocket:')).toBe(':material-rocket:');
  });

  it('does NOT replace :fontawesome-...: icon shortcodes', () => {
    expect(normalizeStandardEmoji(':fontawesome-brands-github:')).toBe(
      ':fontawesome-brands-github:',
    );
  });

  it('does NOT replace :octicons-...:, :simple-...:', () => {
    expect(normalizeStandardEmoji(':octicons-alert-16:')).toBe(':octicons-alert-16:');
    expect(normalizeStandardEmoji(':simple-python:')).toBe(':simple-python:');
  });

  it('leaves unknown shortcodes alone', () => {
    expect(normalizeStandardEmoji(':nonexistent_emoji_xyz:')).toBe(
      ':nonexistent_emoji_xyz:',
    );
  });

  it('does not match across whitespace', () => {
    expect(normalizeStandardEmoji(': smile :')).toBe(': smile :');
  });

  it('idempotent: actual glyphs do not re-translate', () => {
    const first = normalizeStandardEmoji(':smile:');
    expect(normalizeStandardEmoji(first)).toBe(first);
  });

  it('does not replace inside fenced code blocks', () => {
    const src = '```\n:smile:\n```\n';
    expect(normalizeStandardEmoji(src)).toBe(src);
  });

  it('does not replace inside inline code spans', () => {
    expect(normalizeStandardEmoji('Use `:smile:` here.')).toBe(
      'Use `:smile:` here.',
    );
  });
});
