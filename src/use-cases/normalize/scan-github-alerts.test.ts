import { describe, expect, it } from 'vitest';
import { scanGithubAlerts } from './scan-github-alerts.js';

describe('scanGithubAlerts', () => {
  it('detects a single GitHub-style alert', () => {
    const source = '> [!NOTE]\n> Body of the note.\n';
    const diagnostics = scanGithubAlerts(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('github-alert-detected');
    expect(diagnostics[0]?.severity).toBe('info');
    expect(diagnostics[0]?.message).toContain('NOTE');
    expect(diagnostics[0]?.place?.line).toBe(1);
  });

  it('detects all five GitHub alert types (NOTE, TIP, IMPORTANT, WARNING, CAUTION)', () => {
    const source = [
      '> [!NOTE]',
      '> A',
      '',
      '> [!TIP]',
      '> B',
      '',
      '> [!IMPORTANT]',
      '> C',
      '',
      '> [!WARNING]',
      '> D',
      '',
      '> [!CAUTION]',
      '> E',
    ].join('\n');
    const diagnostics = scanGithubAlerts(source);
    expect(diagnostics).toHaveLength(5);
    const types = diagnostics.map((d) => d.message.match(/\[!(\w+)\]/)?.[1]).filter(Boolean);
    expect(types).toEqual(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);
  });

  it('emits per-occurrence with correct line numbers', () => {
    const source = ['Para 1.', '', '> [!NOTE]', '> Body', '', 'Para 2.', '', '> [!WARNING]', '> Body 2'].join('\n');
    const diagnostics = scanGithubAlerts(source);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]?.place?.line).toBe(3);
    expect(diagnostics[1]?.place?.line).toBe(8);
  });

  it('does not match non-alert blockquotes', () => {
    const source = '> Just a regular blockquote.\n> [!FOO]\n> Not a known alert type.\n';
    const diagnostics = scanGithubAlerts(source);
    expect(diagnostics).toHaveLength(0);
  });

  it('is case-sensitive — lowercase alert types are not matched (matches GitHub spec)', () => {
    const source = '> [!note]\n> Body\n';
    expect(scanGithubAlerts(source)).toHaveLength(0);
  });

  it('does not match alert syntax inside fenced code blocks', () => {
    const source = '```\n> [!NOTE]\n> Body\n```\n';
    const diagnostics = scanGithubAlerts(source);
    expect(diagnostics).toHaveLength(0);
  });

  it('returns empty array for source with no alerts', () => {
    expect(scanGithubAlerts('Plain markdown.\n')).toHaveLength(0);
  });
});
