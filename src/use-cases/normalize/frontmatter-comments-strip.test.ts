import { describe, expect, it } from 'vitest';
import { normalizeFrontmatterCommentsStrip } from './frontmatter-comments-strip.js';

describe('normalizeFrontmatterCommentsStrip', () => {
  it('strips `comments: true` from frontmatter', () => {
    // Real-world (wgyhhhh/Mathematical-Foundations-of-Reinforcement-Learning-Notes):
    // Material's per-page Giscus toggle. Starlight's docsSchema has no
    // matching field, and the auto-inferred schema picks `string` when other
    // pages use string-shaped values, so a boolean here fails content-load.
    const src = '---\ntitle: Hello\ncomments: true\n---\nbody\n';
    const out = normalizeFrontmatterCommentsStrip(src);
    expect(out).not.toContain('comments:');
    expect(out).toContain('title: Hello');
  });

  it('strips `comments: false`', () => {
    const src = '---\ntitle: Hello\ncomments: false\n---\nbody\n';
    expect(normalizeFrontmatterCommentsStrip(src)).not.toContain('comments:');
  });

  it('strips boolean `comments` even with a trailing YAML inline comment', () => {
    // wgyhhhh's Preface1.md has `comments: true  # 开启评论`. The trailing
    // YAML comment must not block the strip.
    const src = '---\ntitle: 第一版序言\ncomments: true  # 开启评论\n---\nbody\n';
    const out = normalizeFrontmatterCommentsStrip(src);
    expect(out).not.toContain('comments:');
  });

  it('preserves non-boolean `comments` (treated as a real schema field)', () => {
    // If a project uses `comments: <string>`, that's a custom schema field,
    // not Material's flag — pass through untouched.
    const src = '---\ntitle: Hello\ncomments: "see thread #42"\n---\nbody\n';
    const out = normalizeFrontmatterCommentsStrip(src);
    expect(out).toContain('comments: "see thread #42"');
  });

  it('leaves body `comments:` text alone', () => {
    const src = '---\ntitle: Hello\n---\ncomments: true is fine in prose\n';
    const out = normalizeFrontmatterCommentsStrip(src);
    expect(out).toContain('comments: true is fine in prose');
  });

  it('is a no-op when there is no frontmatter', () => {
    const src = 'body without frontmatter\n';
    expect(normalizeFrontmatterCommentsStrip(src)).toBe(src);
  });

  it('is idempotent', () => {
    const src = '---\ntitle: Hello\ncomments: true\n---\nbody\n';
    const once = normalizeFrontmatterCommentsStrip(src);
    expect(normalizeFrontmatterCommentsStrip(once)).toBe(once);
  });

  it('handles CRLF (Windows) line endings', () => {
    // Real-world (wgyhhhh repo): files committed with CRLF endings. An
    // LF-only frontmatter regex would never enter the strip path and the
    // boolean `comments:` line would survive into the converted output —
    // which then fails the inferred docsSchema at content-load time.
    const src = '---\r\ntitle: Hello\r\ncomments: true\r\n---\r\nbody\r\n';
    const out = normalizeFrontmatterCommentsStrip(src);
    expect(out).not.toContain('comments:');
    expect(out).toContain('title: Hello');
    // CRLF preserved in the round-trip.
    expect(out).toContain('---\r\ntitle: Hello\r\n---');
  });
});
