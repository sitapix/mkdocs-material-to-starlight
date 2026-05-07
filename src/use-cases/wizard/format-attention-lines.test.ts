import { describe, expect, it } from 'vitest';
import { formatAttentionLines } from './format-attention-lines.js';

describe('formatAttentionLines', () => {
  it('renders each row as a `• name` bullet with the description on the next indented line', () => {
    const out = formatAttentionLines([
      { name: 'plugin-mike', description: 'starlight-versions wired' },
    ]);
    expect(out).toBe('• plugin-mike\n   starlight-versions wired');
  });

  it('separates multiple rows with a blank line so each entry reads as its own card', () => {
    const out = formatAttentionLines([
      { name: 'plugin-mike', description: 'starlight-versions wired' },
      { name: 'plugin-privacy', description: 'no automatic conversion' },
    ]);
    expect(out).toBe(
      '• plugin-mike\n   starlight-versions wired\n\n• plugin-privacy\n   no automatic conversion',
    );
  });

  it('returns empty string for an empty list (caller decides whether to render the note)', () => {
    expect(formatAttentionLines([])).toBe('');
  });

  it('applies the name highlighter only to the name portion', () => {
    const out = formatAttentionLines([{ name: 'plugin-mike', description: 'desc here' }], {
      name: (s) => `<<${s}>>`,
    });
    expect(out).toBe('• <<plugin-mike>>\n   desc here');
  });

  it('applies the description highlighter only to the description portion', () => {
    const out = formatAttentionLines([{ name: 'exclude', description: 'https://example.com' }], {
      description: (s) => `[[${s}]]`,
    });
    expect(out).toBe('• exclude\n   [[https://example.com]]');
  });

  it('applies both highlighters when both are provided', () => {
    const out = formatAttentionLines([{ name: 'exclude', description: 'https://example.com' }], {
      name: (s) => `<<${s}>>`,
      description: (s) => `[[${s}]]`,
    });
    expect(out).toBe('• <<exclude>>\n   [[https://example.com]]');
  });
});
