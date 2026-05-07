import { describe, expect, it } from 'vitest';
import { normalizeMedia } from './media.js';

describe('normalizeMedia', () => {
  it('promotes ![type:video](url) to a native HTML5 video element', () => {
    const r = normalizeMedia('![type:video](https://example.com/clip.mp4)');
    expect(r.text).toBe('<video src="https://example.com/clip.mp4" controls></video>');
    expect(r.promotions).toEqual([{ line: 1, kind: 'video', url: 'https://example.com/clip.mp4' }]);
  });

  it('promotes ![type:audio](url) to a native HTML5 audio element', () => {
    const r = normalizeMedia('![type:audio](/audio/talk.mp3)');
    expect(r.text).toBe('<audio src="/audio/talk.mp3" controls></audio>');
    expect(r.promotions).toEqual([{ line: 1, kind: 'audio', url: '/audio/talk.mp3' }]);
  });

  it('does NOT touch a regular image', () => {
    const r = normalizeMedia('![diagram](/img/architecture.png)');
    expect(r.text).toBe('![diagram](/img/architecture.png)');
    expect(r.promotions).toHaveLength(0);
  });

  it('does NOT match alt with extra characters before "type:"', () => {
    const r = normalizeMedia('![see type:audio in spec](a.mp3)');
    expect(r.text).toContain('![see type:audio in spec]');
    expect(r.promotions).toHaveLength(0);
  });

  it('does NOT match alt with trailing characters after the kind name', () => {
    const r = normalizeMedia('![type:videox](v.mp4)');
    expect(r.text).toBe('![type:videox](v.mp4)');
    expect(r.promotions).toHaveLength(0);
  });

  it('escapes ampersands and double-quotes in the URL', () => {
    const r = normalizeMedia('![type:video](https://x.com/v.mp4?a=1&b=2)');
    expect(r.text).toContain('src="https://x.com/v.mp4?a=1&amp;b=2"');
  });

  it('preserves URL fragments verbatim', () => {
    const r = normalizeMedia('![type:video](v.mp4#t=10)');
    expect(r.text).toContain('src="v.mp4#t=10"');
  });

  it('handles the empty-URL case', () => {
    const r = normalizeMedia('![type:video]()');
    expect(r.text).toBe('<video src="" controls></video>');
    expect(r.promotions).toHaveLength(1);
  });

  it('promotes multiple media nodes in one document with one promotion record each', () => {
    const r = normalizeMedia('![type:video](v.mp4)\n\n![type:audio](a.mp3)\n');
    expect(r.text).toContain('<video src="v.mp4" controls></video>');
    expect(r.text).toContain('<audio src="a.mp3" controls></audio>');
    expect(r.promotions).toEqual([
      { line: 1, kind: 'video', url: 'v.mp4' },
      { line: 3, kind: 'audio', url: 'a.mp3' },
    ]);
  });

  it('records 1-based line numbers for each promotion', () => {
    const r = normalizeMedia(
      '# Heading\n\n![type:video](v.mp4)\n\nSomething else.\n\n![type:audio](a.mp3)\n',
    );
    expect(r.promotions.map((p) => p.line)).toEqual([3, 7]);
  });

  it('is fence-shielded — media markers inside fenced code are NOT promoted', () => {
    const r = normalizeMedia('```\n![type:video](v.mp4)\n```\n\n![type:video](real.mp4)\n');
    // Code-fenced version stays as-is.
    expect(r.text).toContain('```\n![type:video](v.mp4)\n```');
    // Outside-fence version is promoted.
    expect(r.text).toContain('<video src="real.mp4" controls></video>');
    expect(r.promotions).toHaveLength(1);
    expect(r.promotions[0]?.line).toBe(5);
  });

  it('is idempotent — output is not media-shaped, so a second pass is a no-op', () => {
    const first = normalizeMedia('![type:video](v.mp4)');
    const second = normalizeMedia(first.text);
    expect(second.text).toBe(first.text);
    expect(second.promotions).toHaveLength(0);
  });

  it('handles multiple media on the same line', () => {
    const r = normalizeMedia('![type:video](v1.mp4) and ![type:video](v2.mp4)');
    expect(r.text).toContain('<video src="v1.mp4" controls></video>');
    expect(r.text).toContain('<video src="v2.mp4" controls></video>');
    expect(r.promotions).toHaveLength(2);
    expect(r.promotions[0]?.line).toBe(1);
    expect(r.promotions[1]?.line).toBe(1);
  });

  it('promotes media inside list items and blockquotes (no special handling needed)', () => {
    const r = normalizeMedia(
      '- intro\n- ![type:video](v.mp4)\n\n> Quote:\n> ![type:audio](a.mp3)\n',
    );
    expect(r.text).toContain('<video src="v.mp4" controls></video>');
    expect(r.text).toContain('<audio src="a.mp3" controls></audio>');
    expect(r.promotions).toHaveLength(2);
  });

  it('preserves surrounding markdown around the media', () => {
    const r = normalizeMedia('# Heading\n\nBefore.\n\n![type:video](v.mp4)\n\n> After.');
    expect(r.text).toContain('# Heading');
    expect(r.text).toContain('Before.');
    expect(r.text).toContain('<video src="v.mp4" controls></video>');
    expect(r.text).toContain('> After.');
  });
});
