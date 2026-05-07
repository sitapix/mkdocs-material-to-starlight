import { describe, expect, it } from 'vitest';
import type { PluginDescriptor } from '../../domain/transform/plugin-contract.js';
import { assemblePipeline } from './assembler.js';

const plugin = (overrides: Partial<PluginDescriptor>): PluginDescriptor => {
  const id = overrides.id ?? 'p';
  return {
    id,
    stage: 'transform',
    ownsNamespaces: [{ nodeType: 'containerDirective', name: id }],
    dependsOn: [],
    ...overrides,
  };
};

describe('assemblePipeline', () => {
  it('returns plugins ordered by stage, preserving in-stage input order', () => {
    const stringify = plugin({ id: 'stringify', stage: 'stringify' });
    const normalize = plugin({ id: 'normalize', stage: 'normalize' });
    const transformA = plugin({
      id: 'a',
      stage: 'transform',
      ownsNamespaces: [{ nodeType: 'containerDirective', name: 'a' }],
    });
    const transformB = plugin({
      id: 'b',
      stage: 'transform',
      ownsNamespaces: [{ nodeType: 'containerDirective', name: 'b' }],
    });

    const result = assemblePipeline([stringify, transformB, normalize, transformA]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((p) => p.id)).toEqual(['normalize', 'b', 'a', 'stringify']);
    }
  });

  it('rejects two plugins claiming the same (nodeType, name) cell', () => {
    const a = plugin({
      id: 'a',
      ownsNamespaces: [{ nodeType: 'containerDirective', name: 'note' }],
    });
    const b = plugin({
      id: 'b',
      ownsNamespaces: [{ nodeType: 'containerDirective', name: 'note' }],
    });

    const result = assemblePipeline([a, b]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/duplicate/i);
      expect(result.error.message).toContain('containerDirective');
      expect(result.error.message).toContain('note');
    }
  });

  it('rejects a missing dependency', () => {
    const dependent = plugin({ id: 'a', dependsOn: ['ghost'] });
    const result = assemblePipeline([dependent]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/ghost/);
      expect(result.error.message).toMatch(/missing/i);
    }
  });

  it('rejects an out-of-order dependency (later plugin needs an earlier-stage one)', () => {
    const earlyDepender = plugin({
      id: 'normalizer',
      stage: 'normalize',
      dependsOn: ['post-stringify'],
    });
    const lateDep = plugin({
      id: 'post-stringify',
      stage: 'stringify',
      ownsNamespaces: [{ nodeType: 'root', name: null }],
    });

    const result = assemblePipeline([earlyDepender, lateDep]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/order|stage/i);
    }
  });

  it('rejects a plugin that fails its own descriptor validation', () => {
    const broken = plugin({ id: '' });
    const result = assemblePipeline([broken]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/id/);
    }
  });

  it('accepts an empty plugin set without crashing', () => {
    const result = assemblePipeline([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});
