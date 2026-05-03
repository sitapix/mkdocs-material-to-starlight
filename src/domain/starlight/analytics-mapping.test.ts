import { describe, expect, it } from 'vitest';
import { mapAnalyticsToHeadEntries } from './analytics-mapping.js';

describe('mapAnalyticsToHeadEntries', () => {
  it('returns null when extras has no analytics block', () => {
    expect(mapAnalyticsToHeadEntries({})).toBeNull();
    expect(mapAnalyticsToHeadEntries({ analytics: null })).toBeNull();
  });

  it('returns null when provider is unrecognized', () => {
    expect(
      mapAnalyticsToHeadEntries({
        analytics: { provider: 'matomo', property: 'X' },
      }),
    ).toBeNull();
  });

  it('returns null when provider is google but property is missing', () => {
    expect(
      mapAnalyticsToHeadEntries({ analytics: { provider: 'google' } }),
    ).toBeNull();
  });

  it('emits two <script> head entries for Google Analytics', () => {
    const result = mapAnalyticsToHeadEntries({
      analytics: { provider: 'google', property: 'G-ABC123' },
    });
    expect(result).not.toBeNull();
    expect(result?.headEntries).toHaveLength(2);
    const [loader, init] = result!.headEntries;
    expect(loader?.tag).toBe('script');
    expect(loader?.attrs?.async).toBe(true);
    expect(loader?.attrs?.src).toContain('G-ABC123');
    expect(init?.tag).toBe('script');
    expect(init?.content).toContain('G-ABC123');
    expect(init?.content).toContain('gtag');
  });

  it('lists feedback widget as unsupported when extra.analytics.feedback is set', () => {
    const result = mapAnalyticsToHeadEntries({
      analytics: {
        provider: 'google',
        property: 'G-ABC123',
        feedback: { title: 'Was this helpful?' },
      },
    });
    expect(result?.unsupported).toContain('feedback');
  });

  it('does not list feedback as unsupported when it is absent', () => {
    const result = mapAnalyticsToHeadEntries({
      analytics: { provider: 'google', property: 'G-ABC123' },
    });
    expect(result?.unsupported).toEqual([]);
  });

  it('escapes the property string into the inline gtag config call', () => {
    const result = mapAnalyticsToHeadEntries({
      analytics: { provider: 'google', property: 'G-XYZ-789' },
    });
    const init = result?.headEntries[1];
    expect(init?.content).toContain("'G-XYZ-789'");
  });
});
