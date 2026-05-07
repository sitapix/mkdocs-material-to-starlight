/**
 * Sanitize untrusted strings before printing them to the terminal.
 *
 * Defends against CWE-150 (terminal escape injection). A hostile
 * `mkdocs.yml`, frontmatter value, or third-party error string can embed
 * control sequences that move the cursor, clear the screen, change the
 * window title, or forge legitimate-looking CLI output. `format-report.ts`
 * interpolates source-derived strings directly into stdout, so unsanitized
 * input would compromise the user's terminal session.
 *
 * Strips:
 *   - CSI (ESC [ ... final byte): cursor, color, screen ops
 *   - OSC (ESC ] ... BEL or ESC\): window title, hyperlinks
 *   - DCS / PM / APC (ESC P|^|_ ... ESC\): device control
 *   - Simple two-byte ESC (ESC + 0x20-0x7E): DECSC / DECRC / RIS
 *   - C1 control codes (0x80-0x9F): 8-bit ESC equivalents
 *   - Raw control chars (BEL / BS / CR / DEL); tab and newline pass through
 *
 * Regex set adapted from vercel-labs/skills (MIT,
 * https://github.com/vercel-labs/skills/blob/main/src/sanitize.ts).
 */

const CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
const DCS_PM_APC_RE = /\x1b[P^_][\s\S]*?\x1b\\/g;
const SIMPLE_ESC_RE = /\x1b[\x20-\x7e]/g;
const C1_RE = /[\x80-\x9f]/g;
const CONTROL_RE = /[\x00-\x06\x07\x08\x0b\x0c\x0d-\x1a\x1c-\x1f\x7f]/g;

/**
 * Strip every terminal escape sequence and dangerous control character from
 * a string. Tab (`\t`) and newline (`\n`) are preserved — they are safe and
 * carry intentional formatting. Output is `print(str)`-safe.
 */
export function stripTerminalEscapes(str: string): string {
  return str
    .replace(OSC_RE, '')
    .replace(DCS_PM_APC_RE, '')
    .replace(CSI_RE, '')
    .replace(SIMPLE_ESC_RE, '')
    .replace(C1_RE, '')
    .replace(CONTROL_RE, '');
}

/**
 * Sanitize a single-line metadata string (a file path, a rule message, a
 * frontmatter value) for safe terminal display: strip escapes AND collapse
 * any newlines/CRs to single spaces, then trim. Use this for anything that
 * should fit on a single output line.
 */
export function sanitizeForSingleLine(str: string): string {
  return stripTerminalEscapes(str)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}
