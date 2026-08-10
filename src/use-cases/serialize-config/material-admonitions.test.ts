import { describe, expect, it } from 'vitest';
import { serializeMaterialAdmonitionsPlugin } from './material-admonitions.js';

describe('serializeMaterialAdmonitionsPlugin', () => {
  it('emits a native remark plugin for every preserved Material variant', () => {
    const out = serializeMaterialAdmonitionsPlugin();
    expect(out).toContain("import { visit } from 'unist-util-visit';");
    expect(out).toContain("visit(tree, 'containerDirective'");
    for (const type of ['abstract', 'info', 'question', 'success', 'failure', 'bug', 'example']) {
      expect(out).toContain(`${type}: {`);
    }
  });

  it('does not reference the deprecated starlight-markdown-blocks package', () => {
    expect(serializeMaterialAdmonitionsPlugin()).not.toContain('starlight-markdown-blocks');
  });
});
