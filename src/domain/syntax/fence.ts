/**
 * Shared CommonMark fenced-code-block detection.
 *
 * Every text-level normalizer needs the "this line opens or closes a fence"
 * test. The naive `/^ {0,3}(```|~~~)/` matches too eagerly: a line like
 * `​`​`​`​`​snippet {path="..."}​`​`​`​`​`​` is inline code, not a fence opener.
 * Treating it as a fence swallows every transform until the parser sees
 * another `​`​`​`​`​` line. pydantic-ai's `examples/slack-lead-qualifier.md`
 * regressed this way (admonitions skipped because a snippet inline-code
 * line falsely toggled `inFence`).
 *
 * CommonMark §4.5: 0-3 leading spaces, then 3+ backticks or 3+ tildes;
 * backtick fences cannot have backticks in their info string; tilde fences
 * accept any info string.
 *
 * Returns true for any valid fenced-code opener or closer; matching marker
 * length is the caller's concern.
 */

const BACKTICK_FENCE = /^ {0,3}`{3,}[^`\n]*$/;
const TILDE_FENCE = /^ {0,3}~{3,}[^\n]*$/;

export function isFenceLine(line: string): boolean {
  return BACKTICK_FENCE.test(line) || TILDE_FENCE.test(line);
}

/**
 * Return the marker character (` or ~) and the run length of the leading
 * fence on a line, or `null` for non-fence lines. Used by stateful fence
 * walkers to honour CommonMark §4.5: a closing fence must use the SAME
 * marker AND at least as many of them as the opener. Without length
 * tracking, a 4-backtick fence whose body contains a `\`\`\`java` (3-tick)
 * line would be falsely closed at the inner line, leaving subsequent
 * prose mis-classified as "still in fence".
 */
export function fenceMarker(line: string): { char: '`' | '~'; length: number } | null {
  if (!isFenceLine(line)) return null;
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (match === null) return null;
  const run = match[1] ?? '';
  return { char: run[0] === '`' ? '`' : '~', length: run.length };
}
