/**
 * Pre-parse normalizer for Material code-block annotations.
 *
 * Material annotates code with two coupled forms:
 *
 *   ``` { .python .annotate }
 *   print("hello")  # (1)!
 *   ```
 *
 *   1.  This is an annotation.
 *
 * The `(N)!` form (with bang) tells PyMdown to strip the surrounding comment
 * characters when rendering the marker, producing an inline popover icon.
 * Starlight has no popover component and no remark plugin handles the
 * positional `(N)` ↔ list-item binding inside fenced code (per
 * `library_audit_20260501.md`).
 *
 * Phase 1 downgrade: strip the `.annotate` class from the fence info string
 * and drop the bang from `(N)!` markers, leaving plain `(N)` visible inside
 * the code (which already pairs with the trailing ordered list's numbers).
 * The user sees:
 *
 *   ``` python
 *   print("hello")  # (1)
 *   ```
 *
 *   1.  This is an annotation.
 *
 * — buildable, readable, semantically intact (the visible `(1)` matches the
 * legend below the code). The popover UX is lost but the user can manually
 * adopt a Starlight component for it; the converter surfaces a diagnostic
 * (`code-annotation-downgraded`) so that loss is explicit.
 *
 * Idempotency: stripping `.annotate` and `!` is monotonic — output contains
 * neither marker, so a second pass finds nothing to rewrite.
 */

const FENCE_OPEN = /^( {0,3})(```|~~~)(.*)$/;
const ANNOTATE_CLASS = /\s*\.annotate\b/g;
const BANG_MARKER = /\((\d+)\)!/g;

export function normalizeCodeAnnotations(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fenceMatch = line.match(FENCE_OPEN);
    if (fenceMatch === null) {
      output.push(line);
      i += 1;
      continue;
    }

    const indent = fenceMatch[1] ?? '';
    const fence = fenceMatch[2] ?? '';
    const info = fenceMatch[3] ?? '';

    if (!info.includes('.annotate')) {
      // Not an annotated fence; copy through untouched (including body).
      output.push(line);
      i += 1;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        output.push(next);
        i += 1;
        if (isMatchingClose(next, fence)) {
          break;
        }
      }
      continue;
    }

    // Annotated fence: rewrite info, then rewrite body markers.
    const cleanedInfo = info.replace(ANNOTATE_CLASS, '');
    const finalInfo = simplifyInfo(cleanedInfo);
    output.push(`${indent}${fence}${finalInfo}`);
    i += 1;

    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (isMatchingClose(next, fence)) {
        output.push(next);
        i += 1;
        break;
      }
      output.push(next.replace(BANG_MARKER, '($1)'));
      i += 1;
    }
  }

  return output.join('\n');
}

function isMatchingClose(line: string, fence: string): boolean {
  const trimmed = line.trim();
  return trimmed === fence || trimmed.startsWith(`${fence}`)
    ? trimmed.replace(/^[`~]+/, '').trim().length === 0
    : false;
}

function simplifyInfo(info: string): string {
  // Reduce `{ .python }` to `python` when the only remaining attr is the
  // language class. Material's docs show `{ .lang .annotate }` form; after
  // stripping `.annotate`, the result is often `{ .python }` which Starlight
  // and Expressive Code both accept but the bare `python` form is cleaner.
  const trimmed = info.trim();
  const braceMatch = trimmed.match(/^\{\s*\.([A-Za-z0-9_-]+)\s*\}$/);
  if (braceMatch !== null) {
    return ` ${braceMatch[1] ?? ''}`;
  }
  return info;
}
