/**
 * Pre-decode normalizer: strip PyYAML unsafe tags (`!!python/name:...`,
 * `!!python/object/apply:...`) so the YAML decoder accepts the file.
 *
 * MkDocs Material configs carry these:
 *   emoji_index: !!python/name:material.extensions.emoji.twemoji
 *   format:      !!python/name:pymdownx.superfences.fence_code_format
 *   slugify:     !!python/object/apply:pymdownx.slugs.slugify
 *     kwds: { case: lower }
 *
 * The Python callable cannot be reproduced; the converter only needs to
 * know the user configured one. Replace the tag with a quoted opaque
 * string so the decoder yields a benign string node, and return the
 * stripped bodies for the caller's diagnostic.
 *
 * Pure and idempotent (output has no `!!python/` tokens).
 */

// Trailing `''` or `""` is YAML's scalar-presence marker — MkDocs Material
// commonly emits e.g. `format: !!python/name:pymdownx.X.fence_code_format ''`.
// We match and discard it (the value is opaque to us either way).
const SCALAR_RE =
  /^(?<indent>\s*)(?<key>[^:#\n]+):\s*!!python\/(?:name|object\/apply):(?<body>[^\s\r\n#'"]+)(?:\s+(?:''|""))?\s*$/gm;

export interface PreprocessResult {
  readonly source: string;
  readonly stripped: ReadonlyArray<string>;
}

export function preprocessMkdocsPythonTags(source: string): PreprocessResult {
  const stripped: string[] = [];
  let result = source;

  result = result.replace(SCALAR_RE, (_, ...args) => {
    const groups = args[args.length - 1] as { indent: string; key: string; body: string };
    stripped.push(groups.body);
    return `${groups.indent}${groups.key}: '${groups.body}'`;
  });

  // The "object/apply" form may have a continuation block (kwds, args, etc.).
  // After replacing the tag line above, the trailing indented block becomes a
  // floating mapping under what is now a string scalar — making it invalid YAML.
  // Strip continuation lines that follow a stripped tag until indent recedes.
  result = stripContinuations(result, stripped);

  return { source: result, stripped };
}

function stripContinuations(
  source: string,
  stripped: ReadonlyArray<string>,
): string {
  if (stripped.length === 0) return source;
  const lines = source.split('\n');
  const out: string[] = [];
  let consumeIndent: number | null = null;
  for (const line of lines) {
    if (consumeIndent !== null) {
      const indent = line.length - line.trimStart().length;
      if (line.trim().length === 0 || indent > consumeIndent) {
        // Drop this continuation line.
        continue;
      }
      consumeIndent = null;
    }
    out.push(line);
    if (isStrippedTagLine(line, stripped)) {
      consumeIndent = line.length - line.trimStart().length;
    }
  }
  return out.join('\n');
}

function isStrippedTagLine(line: string, stripped: ReadonlyArray<string>): boolean {
  for (const body of stripped) {
    if (line.includes(`'${body}'`)) {
      // Heuristic: only treat as continuation-anchor if the value was a
      // python tag we just rewrote. We check for the body inside single
      // quotes — exact form produced by the SCALAR_RE replacement above.
      return true;
    }
  }
  return false;
}
