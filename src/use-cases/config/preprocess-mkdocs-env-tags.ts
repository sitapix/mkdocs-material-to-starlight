/**
 * Pre-decode normalizer: substitute mkdocs's `!ENV` tag with its default
 * value (sequence form) or the bare var name as a string (scalar form),
 * before the YAML decoder ever sees the source.
 *
 * mkdocs uses `!ENV` to read environment variables in config:
 *
 *   docs_dir: !ENV [BUILD_DOCS_DIR, "docs"]
 *   site_url: !ENV SITE_URL
 *   - !ENV [NAV_HOME, "Home"]: "index.md"      # !ENV as mapping key
 *
 * js-yaml accepts a custom Type for the sequence/scalar value forms but has
 * a long-standing limitation around explicit tags on complex mapping keys —
 * it produces "bad indentation of a sequence entry" on the third example
 * above. Pre-substituting the tag eliminates the parser ambiguity entirely.
 *
 * Substitution rules (matching mkdocs's runtime semantics):
 *   - `!ENV [VAR1, ..., default]`  → emit `default` literally  (last element)
 *   - `!ENV VAR`                   → emit `"VAR"` (quoted opaque marker)
 *
 * The transformation is line-based and skips:
 *   - Lines that are pure YAML comments (`# ...`)
 *   - `!ENV` tokens whose starting position lies inside a YAML string literal
 *     (single- or double-quoted span on the same line).
 *
 * Idempotency: substituted output contains no `!ENV` tokens, so a second
 * pass is a no-op.
 *
 * Pure: text → text. No I/O, no external state.
 */

export function preprocessMkdocsEnvTags(source: string): string {
  return stripRelativeTags(
    source
      .split('\n')
      .map(rewriteLine)
      .join('\n'),
  );
}

/**
 * Replace `!relative <token>` with a quoted opaque marker. The mkdocstrings
 * convention `base_path: [!relative $config_dir, !relative $docs_dir/x]`
 * resolves at runtime against the config file location; the converter has
 * its own snippet-base-path resolution and the tag's semantic value is
 * lost on the JS side anyway.
 */
function stripRelativeTags(source: string): string {
  return source.replace(/!relative\s+(\$[^\s,\]]+)/g, "'$1'");
}

function rewriteLine(line: string): string {
  if (isCommentLine(line)) {
    return line;
  }
  return rewriteScanning(line);
}

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith('#');
}

// Walk the line left-to-right, tracking whether we're inside a quoted span.
// At every position outside a quote, look for `!ENV` and substitute it.
function rewriteScanning(line: string): string {
  let out = '';
  let i = 0;
  let inQuote: '"' | "'" | null = null;
  while (i < line.length) {
    const ch = line[i] ?? '';
    if (inQuote !== null) {
      out += ch;
      if (ch === inQuote) {
        inQuote = null;
      }
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (line.startsWith('!ENV', i)) {
      const result = consumeEnvTag(line, i);
      if (result !== null) {
        out += result.replacement;
        i = result.consumedTo;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

interface ConsumedTag {
  readonly replacement: string;
  readonly consumedTo: number;
}

function consumeEnvTag(line: string, start: number): ConsumedTag | null {
  const afterTag = start + '!ENV'.length;
  // Skip whitespace between `!ENV` and the value
  let j = afterTag;
  while (j < line.length && (line[j] === ' ' || line[j] === '\t')) {
    j += 1;
  }
  if (j >= line.length) {
    return null;
  }
  const next = line[j];
  if (next === '[') {
    return consumeEnvSequence(line, j);
  }
  return consumeEnvScalar(line, j);
}

function consumeEnvSequence(line: string, openBracket: number): ConsumedTag | null {
  const close = findMatchingBracket(line, openBracket);
  if (close === -1) {
    return null;
  }
  const body = line.slice(openBracket + 1, close);
  const items = splitTopLevelCommas(body);
  const last = items[items.length - 1] ?? '';
  return { replacement: last.trim(), consumedTo: close + 1 };
}

function consumeEnvScalar(line: string, start: number): ConsumedTag | null {
  // Read an env-var identifier: [A-Z_][A-Z0-9_]*
  if (!isIdentifierStart(line[start] ?? '')) {
    return null;
  }
  let j = start + 1;
  while (j < line.length && isIdentifierContinue(line[j] ?? '')) {
    j += 1;
  }
  const varName = line.slice(start, j);
  return { replacement: `"${varName}"`, consumedTo: j };
}

function isIdentifierStart(ch: string): boolean {
  return ch === '_' || (ch >= 'A' && ch <= 'Z');
}

function isIdentifierContinue(ch: string): boolean {
  return isIdentifierStart(ch) || (ch >= '0' && ch <= '9');
}

function findMatchingBracket(line: string, openBracket: number): number {
  let depth = 0;
  let inQuote: '"' | "'" | null = null;
  for (let i = openBracket; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote !== null) {
      if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '[') {
      depth += 1;
      continue;
    }
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function splitTopLevelCommas(body: string): ReadonlyArray<string> {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  let inQuote: '"' | "'" | null = null;
  for (const ch of body) {
    if (inQuote !== null) {
      current += ch;
      if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '{') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ']' || ch === '}') {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    out.push(current);
  }
  return out;
}
