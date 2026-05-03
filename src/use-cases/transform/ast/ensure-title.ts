/**
 * AST plugin: ensure every output document has a `title` in its YAML
 * frontmatter. Starlight's docs schema requires `title` and rejects pages
 * without it. MkDocs sources are often missing frontmatter entirely (the
 * theme falls back to the first H1), so the converter must synthesize one
 * deterministically.
 *
 * Resolution order:
 *   1. Existing frontmatter `title` field → preserved verbatim
 *   2. First H1 heading text in the document → used as title
 *   3. Filename stem humanized → used as title (e.g. `auth-tokens.md` → `Auth Tokens`)
 *
 * `index.md` files map to `Home` by convention when neither frontmatter nor
 * an H1 supplies a title.
 *
 * Plugin contract:
 *   - Owns the `(yaml, *)` namespace cell at the top of the document.
 *   - Idempotent: a document that already has `title:` in its frontmatter is
 *     left alone.
 *   - Pure given the AST and the supplied `sourcePath`.
 */

import type { Plugin } from 'unified';
import type { Heading, Root, Yaml } from 'mdast';

export interface EnsureTitleOptions {
  readonly sourcePath: string;
}

const TITLE_KEY = /^title\s*:/m;
const NEEDS_QUOTING = /[:#&*!|>'"%@`{}\[\]]/;

export const ensureTitle: Plugin<[EnsureTitleOptions], Root> = (options) => {
  return (tree) => {
    const existingYaml = findYamlNode(tree);
    if (existingYaml !== null && hasTitle(existingYaml.value)) {
      return;
    }
    const title = deriveTitle(tree, options.sourcePath);
    if (existingYaml === null) {
      tree.children.unshift({
        type: 'yaml',
        value: `title: ${quoteIfNeeded(title)}`,
      });
      return;
    }
    existingYaml.value = prependTitle(existingYaml.value, title);
  };
};

function findYamlNode(tree: Root): Yaml | null {
  const first = tree.children[0];
  return first !== undefined && first.type === 'yaml' ? first : null;
}

function hasTitle(yamlSource: string): boolean {
  return TITLE_KEY.test(yamlSource);
}

function deriveTitle(tree: Root, sourcePath: string): string {
  const headingTitle = findFirstH1Text(tree);
  if (headingTitle !== null) {
    return headingTitle;
  }
  return humanizeFilename(sourcePath);
}

function findFirstH1Text(tree: Root): string | null {
  for (const child of tree.children) {
    if (child.type !== 'heading') {
      continue;
    }
    const heading = child as Heading;
    if (heading.depth !== 1) {
      continue;
    }
    return extractHeadingText(heading);
  }
  return null;
}

function extractHeadingText(heading: Heading): string {
  const parts: string[] = [];
  for (const child of heading.children) {
    if (child.type === 'text') {
      parts.push(child.value);
    } else if ('value' in child && typeof child.value === 'string') {
      parts.push(child.value);
    } else if ('children' in child && Array.isArray(child.children)) {
      for (const grand of child.children) {
        if (grand.type === 'text') {
          parts.push(grand.value);
        }
      }
    }
  }
  return parts.join('').trim();
}

function humanizeFilename(sourcePath: string): string {
  const parts = sourcePath.split(/[/\\]/);
  const filename = parts[parts.length - 1] ?? '';
  const stem = filename.replace(/\.(md|mdx)$/i, '');
  if (stem === 'index') {
    return 'Home';
  }
  return stem
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function quoteIfNeeded(title: string): string {
  if (NEEDS_QUOTING.test(title)) {
    const escaped = title.replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return title;
}

function prependTitle(yamlSource: string, title: string): string {
  return `title: ${quoteIfNeeded(title)}\n${yamlSource}`;
}
