/**
 * Translate Material's `extra.analytics` block into a list of Starlight
 * `head[]` entries plus a list of sub-features the converter cannot honor.
 *
 * Material exposes a single declarative analytics block:
 *
 *   extra:
 *     analytics:
 *       provider: google
 *       property: G-XXXXXXXX
 *       feedback:
 *         title: Was this page helpful?
 *         ratings: [...]
 *
 * Starlight has no first-class analytics integration — the canonical pattern
 * is two `<script>` tags injected via the `head` config. This function
 * produces both: the loader script (`<script async src="…/gtag/js?id=…">`)
 * and the inline initializer that calls `gtag('config', ...)` with the user's
 * property ID.
 *
 * The optional `feedback` widget (Was-this-page-helpful thumbs-up/down) has
 * no Starlight equivalent — it is reported as an unsupported sub-feature so
 * the caller can emit a follow-up diagnostic.
 *
 * Pure: takes parsed `extras`, returns the converter shape (or null when no
 * usable analytics block is present). Only the `google` provider is
 * supported today; matomo, plausible, and custom providers fall through to
 * null with no diagnostic so the caller can surface a generic
 * "no equivalent" warning.
 */

export interface HeadEntry {
  readonly tag: 'script' | 'link' | 'meta';
  readonly attrs?: Readonly<Record<string, string | boolean | number>>;
  readonly content?: string;
}

export interface AnalyticsMapping {
  readonly provider: 'google';
  readonly property: string;
  readonly headEntries: ReadonlyArray<HeadEntry>;
  readonly unsupported: ReadonlyArray<string>;
}

export function mapAnalyticsToHeadEntries(
  extras: Readonly<Record<string, unknown>>,
): AnalyticsMapping | null {
  // mkdocs.yml `extra:` block lands under `extras.extra`; fall back to the
  // flat shape so callers can pass either form without thinking about it.
  const inner =
    typeof extras['extra'] === 'object' && extras['extra'] !== null
      ? (extras['extra'] as Record<string, unknown>)
      : extras;
  const analytics = inner['analytics'];
  if (analytics === null || analytics === undefined) return null;
  if (typeof analytics !== 'object') return null;

  const obj = analytics as Record<string, unknown>;
  const provider = obj['provider'];
  if (provider !== 'google') return null;

  const property = obj['property'];
  if (typeof property !== 'string' || property.length === 0) return null;

  const unsupported: string[] = [];
  if (obj['feedback'] !== undefined && obj['feedback'] !== null) {
    unsupported.push('feedback');
  }

  const escaped = escapeJsString(property);
  return {
    provider: 'google',
    property,
    unsupported,
    headEntries: [
      {
        tag: 'script',
        attrs: {
          async: true,
          src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(property)}`,
        },
      },
      {
        tag: 'script',
        content: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escaped}');`,
      },
    ],
  };
}

/** Escape a string so it can be safely embedded inside a single-quoted JS
 *  string literal in the inline `<script>` content. Property IDs Google
 *  issues never contain quotes or backslashes, but we escape defensively
 *  to keep this safe if the YAML ever contains odd characters. */
function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
