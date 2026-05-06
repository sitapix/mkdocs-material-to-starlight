/**
 * Production adapter for the `OutputValidator` port.
 *
 * For `.mdx` files: lazy-imports `@mdx-js/mdx` (the same package Astro
 * uses) and runs `compile()`. Following the established Playwright/
 * pixelmatch pattern in this codebase, `@mdx-js/mdx` is NOT a hard
 * dependency — if not installed, the adapter returns `driver-missing`
 * and the use-case surfaces a single info diagnostic instead of one
 * error per file.
 *
 * For `.md` files: builds the same unified processor Starlight uses
 * (remark-parse + frontmatter + gfm + directive) from packages this
 * project ships with, so .md validation always works.
 *
 * Diagnostic shape: parse errors carry the parser's reported line and
 * column so users can jump straight to the problem.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import type {
  OutputValidator,
  OutputValidationResult,
} from '../../domain/ports/output-validator.js';

interface MdxCompileOptions {
  readonly jsx?: boolean;
  readonly format?: 'mdx' | 'md';
  readonly remarkPlugins?: ReadonlyArray<unknown>;
}

interface MdxModule {
  readonly compile: (text: string, options?: MdxCompileOptions) => Promise<unknown>;
}

interface ParserError {
  readonly message?: string;
  readonly line?: number;
  readonly column?: number;
  readonly position?: { readonly start?: { readonly line?: number; readonly column?: number } };
}

const INSTALL_HINT =
  'install `@mdx-js/mdx` to enable MDX output validation: `npm install --save-dev @mdx-js/mdx`';

const mdProcessor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkMath);

// Mirror Starlight's MDX pipeline so the validator doesn't false-positive
// on syntax Starlight accepts at build time. Without these, plain
// `mdx.compile()` rejects `:::note[label]{key="val"}` (directive attrs as
// JS expression), `:icon[name]{...}` (text directive), and `$$ \frac{a}{b} $$`
// (acorn parses LaTeX braces as JSX expressions). With them, each is parsed
// as a structured node before the JSX expression rules apply.
const MDX_REMARK_PLUGINS: ReadonlyArray<unknown> = [
  remarkFrontmatter,
  remarkGfm,
  remarkDirective,
  remarkMath,
];

export function createMdxOutputValidator(): OutputValidator {
  let mdxPromise: Promise<MdxModule | null> | null = null;

  async function getMdx(): Promise<MdxModule | null> {
    if (mdxPromise === null) {
      mdxPromise = loadMdxOrNull();
    }
    return mdxPromise;
  }

  return {
    async validate(text, extension): Promise<OutputValidationResult> {
      if (extension === 'mdx') {
        const mdx = await getMdx();
        if (mdx === null) {
          return { kind: 'driver-missing', hint: INSTALL_HINT };
        }
        try {
          await mdx.compile(text, {
            jsx: true,
            format: 'mdx',
            remarkPlugins: MDX_REMARK_PLUGINS,
          });
          return { kind: 'ok' };
        } catch (cause) {
          return { kind: 'failure', errors: [normalizeError(cause)] };
        }
      }

      // .md path — use the locally-installed unified processor. Any thrown
      // error from parse() is a syntax problem; otherwise success.
      try {
        mdProcessor.parse(text);
        return { kind: 'ok' };
      } catch (cause) {
        return { kind: 'failure', errors: [normalizeError(cause)] };
      }
    },
  };
}

async function loadMdxOrNull(): Promise<MdxModule | null> {
  try {
    const mod = (await import('@mdx-js/mdx' as string)) as unknown as MdxModule;
    return mod;
  } catch {
    return null;
  }
}

function normalizeError(cause: unknown): {
  readonly line: number | null;
  readonly column: number | null;
  readonly message: string;
} {
  if (cause === null || typeof cause !== 'object') {
    return { line: null, column: null, message: String(cause) };
  }
  const e = cause as ParserError;
  const message = (e.message ?? String(cause)).split('\n')[0] ?? String(cause);
  const line =
    typeof e.line === 'number'
      ? e.line
      : typeof e.position?.start?.line === 'number'
        ? e.position.start.line
        : null;
  const column =
    typeof e.column === 'number'
      ? e.column
      : typeof e.position?.start?.column === 'number'
        ? e.position.start.column
        : null;
  return { line, column, message };
}
