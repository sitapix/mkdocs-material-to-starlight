import { describe, expect, it } from 'vitest';
import { applyThirdPartyPluginPolicy } from './plugin-policy.js';

describe('applyThirdPartyPluginPolicy', () => {
  it('keeps built-in and converter-owned features', () => {
    expect(applyThirdPartyPluginPolicy(['last-updated', 'markdown-blocks', 'rss'])).toEqual([
      'last-updated',
      'markdown-blocks',
      'rss',
    ]);
  });

  it('removes detected third-party plugins by default', () => {
    expect(
      applyThirdPartyPluginPolicy([
        'page-actions',
        'sidebar-topics',
        'github-alerts',
        'mermaid',
        'og-cards',
      ]),
    ).toEqual([]);
  });

  it('keeps only third-party plugins explicitly enabled by the caller', () => {
    expect(
      applyThirdPartyPluginPolicy(
        ['page-actions', 'sidebar-topics', 'last-updated'],
        new Set(['sidebar-topics']),
      ),
    ).toEqual(['sidebar-topics', 'last-updated']);
  });
});
