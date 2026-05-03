import { describe, expect, it } from 'vitest';
import { deriveEditLinkBaseUrl } from './edit-link.js';

describe('deriveEditLinkBaseUrl', () => {
  it('returns null when repo_url is missing', () => {
    expect(deriveEditLinkBaseUrl(null, 'edit/main/docs/')).toBeNull();
  });

  it('returns null when edit_uri is missing', () => {
    expect(deriveEditLinkBaseUrl('https://github.com/x/y', null)).toBeNull();
  });

  it('returns null when edit_uri is empty (Material disable convention)', () => {
    expect(deriveEditLinkBaseUrl('https://github.com/x/y', '')).toBeNull();
  });

  it('joins repo_url and edit_uri with a single slash', () => {
    expect(deriveEditLinkBaseUrl('https://github.com/x/y', 'edit/main/docs/')).toBe(
      'https://github.com/x/y/edit/main/docs/',
    );
  });

  it('handles repo_url trailing slash and edit_uri leading slash', () => {
    expect(deriveEditLinkBaseUrl('https://github.com/x/y/', '/edit/main/docs/')).toBe(
      'https://github.com/x/y/edit/main/docs/',
    );
  });

  it('passes through an absolute edit_uri (Ultralytics pattern)', () => {
    expect(
      deriveEditLinkBaseUrl(
        'https://github.com/x/y',
        'https://github.com/ultralytics/ultralytics/tree/main/docs/en/',
      ),
    ).toBe('https://github.com/ultralytics/ultralytics/tree/main/docs/en/');
  });
});
