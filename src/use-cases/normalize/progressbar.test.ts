import { describe, expect, it } from 'vitest';
import { normalizeProgressBar } from './progressbar.js';

describe('normalizeProgressBar', () => {
  it('returns input unchanged when no progressbar markers are present', () => {
    const src = 'Plain text with no markers.\n';
    expect(normalizeProgressBar(src)).toBe(src);
  });

  it('translates [=85%] without label', () => {
    const out = normalizeProgressBar('Status: [=85%]\n');
    expect(out).toContain('<progress value="85" max="100"></progress>');
  });

  it('translates [=85% "85%"] with label', () => {
    const out = normalizeProgressBar('Status: [=85% "85%"]\n');
    expect(out).toContain('<progress value="85" max="100">85%</progress>');
  });

  it('translates fraction form [=1/2 "Half"]', () => {
    const out = normalizeProgressBar('[=1/2 "Half"]\n');
    expect(out).toContain('<progress value="50" max="100">Half</progress>');
  });

  it('translates fraction with custom label', () => {
    const out = normalizeProgressBar('[=3/4 "75%"]\n');
    expect(out).toContain('<progress value="75" max="100">75%</progress>');
  });

  it('clamps percentages above 100', () => {
    const out = normalizeProgressBar('[=150%]\n');
    expect(out).toContain('<progress value="100" max="100"></progress>');
  });

  it('does not match content inside fenced code blocks', () => {
    const src = '```\n[=85%]\n```\n';
    expect(normalizeProgressBar(src)).toBe(src);
  });

  it('handles multiple progress bars on the same line', () => {
    const out = normalizeProgressBar('Done: [=80%] / Pending: [=20% "20%"]\n');
    expect(out).toContain('<progress value="80" max="100"></progress>');
    expect(out).toContain('<progress value="20" max="100">20%</progress>');
  });

  it('idempotent: a second pass leaves emitted HTML untouched', () => {
    const src = '[=50% "Half"]\n';
    const once = normalizeProgressBar(src);
    expect(normalizeProgressBar(once)).toBe(once);
  });

  it('handles decimal percentages', () => {
    const out = normalizeProgressBar('[=33.3% "1/3"]\n');
    expect(out).toContain('value="33"');
  });
});
