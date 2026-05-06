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

  it('replaces :red_circle:, :green_circle:, :yellow_circle: status markers', () => {
    expect(normalizeStandardEmoji(':red_circle: :green_circle: :yellow_circle:')).toBe(
      '🔴 🟢 🟡',
    );
  });

  it('tolerates backslash-escaped underscores from remark-stringify (`:red\\_circle:`)', () => {
    // After remark-stringify processes a markdown table cell, underscores get
    // backslash-escaped. Without this tolerance, real Material site content
    // like `| :red\_circle: This page... |` would render as literal text.
    expect(normalizeStandardEmoji(':red\\_circle:')).toBe('🔴');
    expect(normalizeStandardEmoji(':white\\_check\\_mark:')).toBe('✅');
  });

  it('replaces :+1: and :-1: keypad shortcodes', () => {
    expect(normalizeStandardEmoji(':+1:')).toBe('👍');
    expect(normalizeStandardEmoji(':-1:')).toBe('👎');
  });

  it('replaces common arrow shortcodes', () => {
    expect(normalizeStandardEmoji(':arrow_up: :arrow_right:')).toBe('⬆️ ➡️');
  });

  describe('Starlight icon fallback', () => {
    it('emits <Icon> JSX with `sl-inline-icon` class for shortcodes that match a Starlight icon name', () => {
      // `bitbucket`, `mastodon`, `discord` are Starlight icon names but not
      // standard GitHub emojis. The fallback emits `<Icon class="sl-inline-icon" />`;
      // the converter's stylesheet shim restores inline-block layout so
      // Starlight's default `display: block` for SVGs in markdown content
      // doesn't break the icon onto its own line.
      expect(normalizeStandardEmoji(':bitbucket:')).toBe(
        '<Icon name="bitbucket" class="sl-inline-icon" />',
      );
      expect(normalizeStandardEmoji(':mastodon:')).toBe(
        '<Icon name="mastodon" class="sl-inline-icon" />',
      );
    });

    it('prefers gemoji emoji over Starlight icon when both have the name', () => {
      // `rocket` is in BOTH gemoji (🚀) and Starlight icons. gemoji wins.
      expect(normalizeStandardEmoji(':rocket:')).toBe('🚀');
    });

    it('still passes through GitHub-custom emojis with no Unicode and no icon', () => {
      // `:octocat:` is GitHub-only (PNG asset). Not in gemoji, not in
      // Starlight's icon set, so it stays as literal text.
      expect(normalizeStandardEmoji(':octocat:')).toBe(':octocat:');
    });

    it('does not emit Icon JSX inside fenced code', () => {
      const src = '```\n:bitbucket:\n```\n';
      expect(normalizeStandardEmoji(src)).toBe(src);
    });
  });
});
