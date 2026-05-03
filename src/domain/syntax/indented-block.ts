/**
 * Read a contiguous indented block from a line array.
 *
 * Material's admonition body is the run of lines indented by at least
 * `threshold` spaces, allowing internal blank lines but stopping at the first
 * non-blank line that is less indented than the threshold. Trailing blank
 * lines are dropped — they belong to the surrounding document, not the block.
 *
 * Returns `bodyLines` with the leading `threshold` spaces stripped (so the
 * caller sees the body in its own coordinate system) and `nextIndex`, the
 * line index at which the block ends and outer parsing should resume.
 *
 * Pure function: takes lines, returns a record. No I/O, no mutation.
 */

export interface IndentedBlock {
  readonly bodyLines: ReadonlyArray<string>;
  readonly nextIndex: number;
}

export function readIndentedBlock(
  lines: ReadonlyArray<string>,
  startIndex: number,
  threshold: number,
): IndentedBlock {
  const collected: string[] = [];
  let i = startIndex;
  let lastNonBlank = -1;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      collected.push('');
      i += 1;
      continue;
    }
    if (countLeadingSpaces(line) < threshold) {
      break;
    }
    collected.push(line.slice(threshold));
    lastNonBlank = collected.length - 1;
    i += 1;
  }

  const bodyLines = lastNonBlank === -1 ? [] : collected.slice(0, lastNonBlank + 1);
  const trailingBlanks = collected.length - bodyLines.length;

  return { bodyLines, nextIndex: i - trailingBlanks };
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function countLeadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === ' ') {
    n += 1;
  }
  return n;
}
