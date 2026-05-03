import { describe, expect, it } from 'vitest';
import { normalizeImages } from './images.js';

describe('normalizeImages', () => {
  it('passes through plain images with no attr_list suffix unchanged', () => {
    const src = '![Diagram](diagram.png)\n';
    expect(normalizeImages(src)).toBe(src);
  });

  it('rewrites { align=left } as raw <img> with class md-align-left', () => {
    const src = '![Diagram](diagram.png){ align=left }\n';
    expect(normalizeImages(src)).toBe(
      '<img src="diagram.png" alt="Diagram" class="md-align-left">\n',
    );
  });

  it('rewrites { align=right } as raw <img> with class md-align-right', () => {
    const src = '![Diagram](diagram.png){ align=right }\n';
    expect(normalizeImages(src)).toBe(
      '<img src="diagram.png" alt="Diagram" class="md-align-right">\n',
    );
  });

  it('preserves width and loading attributes on the rewritten <img>', () => {
    const src = '![Diagram](diagram.png){ width="300" loading=lazy }\n';
    const out = normalizeImages(src);
    expect(out).toContain('<img');
    expect(out).toContain('src="diagram.png"');
    expect(out).toContain('alt="Diagram"');
    expect(out).toContain('width="300"');
    expect(out).toContain('loading="lazy"');
  });

  it('combines align with width in one <img>', () => {
    const src = '![Diagram](diagram.png){ align=right width="200" }\n';
    const out = normalizeImages(src);
    expect(out).toContain('class="md-align-right"');
    expect(out).toContain('width="200"');
  });

  it('does not rewrite an image whose attr_list contains no recognized keys', () => {
    // Unrecognized attrs are ignored — we don't strip them, but we also don't
    // promote the image to HTML. (Phase-1: leave alone for downstream remark
    // to handle or for the user to fix manually.)
    const src = '![Diagram](diagram.png){ data-custom=x }\n';
    expect(normalizeImages(src)).toBe(src);
  });

  it('does not touch lines inside fenced code blocks', () => {
    const src = [
      '```',
      '![x](y.png){ align=left }',
      '```',
      '',
    ].join('\n');
    expect(normalizeImages(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = '![Diagram](diagram.png){ align=left width="300" }\n';
    const once = normalizeImages(src);
    const twice = normalizeImages(once);
    expect(twice).toBe(once);
  });

  it('promotes #only-light hash images to <img class="only-light">', () => {
    const src = '![Diagram](diagram.png#only-light)\n';
    expect(normalizeImages(src)).toBe(
      '<img src="diagram.png" alt="Diagram" class="only-light">\n',
    );
  });

  it('promotes #only-dark hash images to <img class="only-dark">', () => {
    const src = '![Diagram](diagram-dark.png#only-dark)\n';
    expect(normalizeImages(src)).toBe(
      '<img src="diagram-dark.png" alt="Diagram" class="only-dark">\n',
    );
  });

  it('combines #only-light hash with align attr_list', () => {
    const src = '![Diagram](diagram.png#only-light){ align=right }\n';
    const out = normalizeImages(src);
    expect(out).toContain('class="md-align-right only-light"');
    expect(out).toContain('src="diagram.png"');
  });
});
