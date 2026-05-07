/**
 * Extract per-plugin option dicts that downstream serializers translate
 * into starlight-blog / starlight-tags / astro-og-canvas equivalents:
 *
 *   - blogOptions:           Material `blog` plugin options, with
 *                            `.authors.yml` resolution applied.
 *   - tagsOptions:           Material `tags` plugin options (passed
 *                            through verbatim when non-empty).
 *   - socialCardsLayoutOptions: Material `social` plugin's
 *                            `cards_layout_options` block.
 *
 * Async because the blog plugin's authors live in a sidecar
 * `<docs_dir>/<blog_dir>/.authors.yml` file we read via the FileSystem
 * port. Pulled out of the orchestrator so the plumbing is in one place.
 */

import { join } from 'node:path';
import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';

export interface PluginOptions {
  readonly blogOptions: Readonly<Record<string, unknown>> | undefined;
  readonly tagsOptions: Readonly<Record<string, unknown>> | undefined;
  readonly socialCardsLayoutOptions: Readonly<Record<string, unknown>> | undefined;
}

export interface ExtractPluginOptionsInput {
  readonly plugins: ReadonlyArray<MkdocsPlugin>;
  readonly docsDir: string;
  readonly fs: FileSystem;
  readonly yaml: YamlDecoder;
}

export async function extractPluginOptions(
  input: ExtractPluginOptionsInput,
): Promise<PluginOptions> {
  const blogPlugin = input.plugins.find((p) => p.name === 'blog');
  const tagsPlugin = input.plugins.find((p) => p.name === 'tags');
  const socialPlugin = input.plugins.find((p) => p.name === 'social');

  // Material blog plugin: blog_dir defaults to `blog`. Authors live in
  // `<docs_dir>/<blog_dir>/.authors.yml`. starlight-blog needs them as
  // the `authors` field of the plugin invocation; without this, every
  // blog post fails with "Author 'X' not found in the blog configuration."
  const blogDir =
    typeof blogPlugin?.options.blog_dir === 'string'
      ? (blogPlugin.options.blog_dir as string)
      : 'blog';
  const authorsFromFile = await readAuthorsYml(
    input.fs,
    input.yaml,
    join(input.docsDir, blogDir, '.authors.yml'),
  );

  const blogOptionsBase = blogPlugin !== undefined ? blogPlugin.options : {};
  // Author resolution priority:
  //   1. `plugins.blog.authors:` is an object map → use it verbatim.
  //   2. Otherwise (missing OR a flag like `authors: true`), prefer the
  //      sidecar `.authors.yml` if present. Real-world (ksaaskil): mkdocs.yml
  //      has `authors: true` + `authors_file: "{blog}/.authors.yml"`, so the
  //      flag wins under "any defined" semantics and the file's contents
  //      never reach starlight-blog — every post then fails with
  //      "Author 'ksaaskil' not found in the blog configuration."
  const baseAuthors = blogOptionsBase.authors;
  const baseAuthorsIsObjectMap =
    baseAuthors !== null && typeof baseAuthors === 'object' && !Array.isArray(baseAuthors);
  const blogOptions =
    blogPlugin !== undefined &&
    (Object.keys(blogOptionsBase).length > 0 || authorsFromFile !== undefined)
      ? authorsFromFile !== undefined && !baseAuthorsIsObjectMap
        ? { ...blogOptionsBase, authors: authorsFromFile }
        : blogOptionsBase
      : undefined;

  const tagsOptions =
    tagsPlugin !== undefined && Object.keys(tagsPlugin.options).length > 0
      ? tagsPlugin.options
      : undefined;

  const rawSocialLayout = socialPlugin?.options.cards_layout_options;
  const socialCardsLayoutOptions =
    rawSocialLayout !== null && typeof rawSocialLayout === 'object'
      ? (rawSocialLayout as Readonly<Record<string, unknown>>)
      : undefined;

  return { blogOptions, tagsOptions, socialCardsLayoutOptions };
}

async function readAuthorsYml(
  fs: FileSystem,
  yaml: YamlDecoder,
  authorsYmlPath: string,
): Promise<Record<string, unknown> | undefined> {
  const read = await fs.readText(authorsYmlPath);
  if (!read.ok) return undefined;
  const decoded = yaml.decode(read.value);
  if (!decoded.ok) return undefined;
  const root = decoded.value as Record<string, unknown> | null;
  if (root === null || typeof root !== 'object') return undefined;
  const authors = root.authors;
  if (authors === null || typeof authors !== 'object') return undefined;
  return authors as Record<string, unknown>;
}
