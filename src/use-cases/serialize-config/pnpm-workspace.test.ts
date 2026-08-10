import { describe, expect, it } from 'vitest';
import { serializePnpmWorkspace } from './pnpm-workspace.js';

describe('serializePnpmWorkspace', () => {
  it('allows only the esbuild install script required by Astro', () => {
    expect(serializePnpmWorkspace()).toBe('allowBuilds:\n  esbuild: true\n');
  });
});
