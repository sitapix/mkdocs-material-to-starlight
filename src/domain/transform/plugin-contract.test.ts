import { describe, expect, it } from 'vitest';
import {
  PIPELINE_STAGES,
  validatePluginDescriptor,
  type PluginDescriptor,
  type PipelineStage,
} from './plugin-contract.js';

const minimal = (overrides: Partial<PluginDescriptor> = {}): PluginDescriptor => ({
  id: 'admonition',
  stage: 'transform',
  ownsNamespaces: [{ nodeType: 'containerDirective', name: 'note' }],
  dependsOn: [],
  ...overrides,
});

describe('validatePluginDescriptor', () => {
  it('accepts a well-formed descriptor', () => {
    const result = validatePluginDescriptor(minimal());
    expect(result.ok).toBe(true);
  });

  it('rejects an empty plugin id', () => {
    const result = validatePluginDescriptor(minimal({ id: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/id/);
    }
  });

  it('rejects an unknown stage', () => {
    const result = validatePluginDescriptor(
      minimal({ stage: 'magic' as PipelineStage }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/stage/);
    }
  });

  it('rejects an empty namespace list — every plugin must declare its node ownership', () => {
    const result = validatePluginDescriptor(minimal({ ownsNamespaces: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/namespace/i);
    }
  });

  it('exposes the canonical pipeline stage list', () => {
    expect([...PIPELINE_STAGES]).toEqual([
      'normalize',
      'parse',
      'expand-snippets',
      'transform',
      'document-decision',
      'stringify',
    ]);
  });
});
