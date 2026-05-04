import { describe, expect, it } from 'vitest';
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { scanNavTopics } from './nav-topics.js';

const file = (path: string, title: string | null = null): MkdocsNavEntry => ({
  kind: 'file',
  path,
  title,
});

const section = (
  title: string,
  children: ReadonlyArray<MkdocsNavEntry>,
): MkdocsNavEntry => ({ kind: 'section', title, children });

describe('scanNavTopics', () => {
  it('returns no diagnostic for an empty nav', () => {
    expect(scanNavTopics([])).toHaveLength(0);
  });

  it('returns no diagnostic when there is only a single top-level section', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      section('Guide', [file('a.md'), file('b.md')]),
    ];
    expect(scanNavTopics(nav)).toHaveLength(0);
  });

  it('returns no diagnostic when top-level entries are flat files', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      file('home.md', 'Home'),
      file('about.md', 'About'),
      file('contact.md', 'Contact'),
    ];
    expect(scanNavTopics(nav)).toHaveLength(0);
  });

  it('emits one info diagnostic when 2+ top-level sections each have children', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      section('Guide', [file('g/a.md'), file('g/b.md')]),
      section('Reference', [file('r/a.md'), file('r/b.md')]),
    ];
    const diags = scanNavTopics(nav);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('nav-multi-topic-detected');
    expect(diags[0]?.severity).toBe('info');
    expect(diags[0]?.message).toMatch(/starlight-sidebar-topics/);
  });

  it('emits the diagnostic when 3+ sections coexist with files at the top level', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      file('index.md', 'Home'),
      section('Guide', [file('g/a.md')]),
      section('API', [file('a/a.md')]),
      section('Tutorials', [file('t/a.md')]),
    ];
    expect(scanNavTopics(nav)).toHaveLength(1);
  });

  it('does not emit when sections are nested inside a single top-level section', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      section('Docs', [
        section('Guide', [file('g/a.md')]),
        section('API', [file('a/a.md')]),
      ]),
    ];
    expect(scanNavTopics(nav)).toHaveLength(0);
  });

  it('does not emit when both top-level sections are empty (no children)', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      section('Empty One', []),
      section('Empty Two', []),
    ];
    // Empty sections don't represent a real "topic" worth recommending the plugin for.
    expect(scanNavTopics(nav)).toHaveLength(0);
  });

  it('mentions both top-level section titles in the message', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      section('Guide', [file('g/a.md')]),
      section('Reference', [file('r/a.md')]),
    ];
    const [diag] = scanNavTopics(nav);
    expect(diag?.message).toMatch(/Guide/);
    expect(diag?.message).toMatch(/Reference/);
  });
});
