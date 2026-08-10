import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import { err, ok } from '../../domain/result.js';
import { extractPluginOptions } from './extract-plugin-options.js';

function fileSystem(files: Readonly<Record<string, string>>): FileSystem {
  return {
    async readText(path) {
      return path in files
        ? ok(files[path] ?? '')
        : err({ code: 'not-found', path, message: 'missing' });
    },
    async exists(path) {
      return path in files;
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

const jsonYaml: YamlDecoder = {
  decode(source) {
    try {
      return ok(JSON.parse(source) as unknown);
    } catch {
      return err({ message: 'invalid YAML' });
    }
  },
};

describe('extractPluginOptions', () => {
  it('returns no options when the relevant plugins and authors file are absent', async () => {
    await expect(
      extractPluginOptions({ plugins: [], docsDir: '/docs', fs: fileSystem({}), yaml: jsonYaml }),
    ).resolves.toEqual({
      blogOptions: undefined,
      tagsOptions: undefined,
      socialCardsLayoutOptions: undefined,
    });
  });

  it('loads sidecar authors and extracts configured plugin options', async () => {
    const authors = { ada: { name: 'Ada' } };
    const result = await extractPluginOptions({
      plugins: [
        { name: 'blog', options: { blog_dir: 'news', authors: true } },
        { name: 'tags', options: { tags_file: 'tags.md' } },
        { name: 'social', options: { cards_layout_options: { background_color: '#fff' } } },
      ],
      docsDir: '/docs',
      fs: fileSystem({ '/docs/news/.authors.yml': JSON.stringify({ authors }) }),
      yaml: jsonYaml,
    });

    expect(result).toEqual({
      blogOptions: { blog_dir: 'news', authors },
      tagsOptions: { tags_file: 'tags.md' },
      socialCardsLayoutOptions: { background_color: '#fff' },
    });
  });

  it('preserves an inline author map over the sidecar file', async () => {
    const inline = { grace: { name: 'Grace' } };
    const result = await extractPluginOptions({
      plugins: [{ name: 'blog', options: { authors: inline } }],
      docsDir: '/docs',
      fs: fileSystem({
        '/docs/blog/.authors.yml': JSON.stringify({ authors: { ada: { name: 'Ada' } } }),
      }),
      yaml: jsonYaml,
    });

    expect(result.blogOptions).toEqual({ authors: inline });
  });

  it('adds sidecar authors to an otherwise empty blog configuration', async () => {
    const authors = { ada: { name: 'Ada' } };
    const result = await extractPluginOptions({
      plugins: [{ name: 'blog', options: {} }],
      docsDir: '/docs',
      fs: fileSystem({ '/docs/blog/.authors.yml': JSON.stringify({ authors }) }),
      yaml: jsonYaml,
    });

    expect(result.blogOptions).toEqual({ authors });
  });

  it.each([
    ['invalid YAML', '{'],
    ['a null document', 'null'],
    ['a scalar document', '"authors"'],
    ['null authors', '{"authors":null}'],
    ['scalar authors', '{"authors":"ada"}'],
  ])('ignores %s in the authors sidecar', async (_label, source) => {
    const result = await extractPluginOptions({
      plugins: [
        { name: 'blog', options: { post_url_format: '{slug}' } },
        { name: 'tags', options: {} },
        { name: 'social', options: { cards_layout_options: null } },
      ],
      docsDir: '/docs',
      fs: fileSystem({ '/docs/blog/.authors.yml': source }),
      yaml: jsonYaml,
    });

    expect(result).toEqual({
      blogOptions: { post_url_format: '{slug}' },
      tagsOptions: undefined,
      socialCardsLayoutOptions: undefined,
    });
  });

  it('rejects scalar social layout options', async () => {
    const result = await extractPluginOptions({
      plugins: [{ name: 'social', options: { cards_layout_options: 'default' } }],
      docsDir: '/docs',
      fs: fileSystem({}),
      yaml: jsonYaml,
    });

    expect(result.socialCardsLayoutOptions).toBeUndefined();
  });
});
