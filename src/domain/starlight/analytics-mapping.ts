/**
 * Translate Material's `extra.analytics` block into Starlight `head[]`
 * entries plus a list of sub-features the converter cannot honor.
 *
 *   extra:
 *     analytics:
 *       provider: google
 *       property: G-XXXXXXXX
 *
 * Starlight has no first-class analytics integration; the canonical pattern
 * is two `<script>` tags injected via `head`. This produces the loader
 * (`<script async src="…/gtag/js?id=…">`) and the inline `gtag('config', ...)`
 * initializer.
 *
 * The optional `feedback` widget (was-this-page-helpful) has no Starlight
 * equivalent and is reported as an unsupported sub-feature for the caller
 * to surface as a diagnostic.
 *
 * Pure. Only the `google` provider is supported; matomo, plausible, and
 * custom providers return null for the caller's generic "no equivalent"
 * warning path.
 */

interface HeadEntry {
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
