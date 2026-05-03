/**
 * Translate Material's `extra.social[]` entries into Starlight's `social[]`
 * config shape.
 *
 * Material:
 *   extra:
 *     social:
 *       - icon: fontawesome/brands/github
 *         link: https://github.com/...
 *         name: Optional accessible name
 *
 * Starlight:
 *   social: [{ icon: 'github', label: 'GitHub', href: '...' }]
 *
 * The icon vocabularies don't match: Material uses FontAwesome path-style
 * names; Starlight has its own ~30-key icon set. The mapping below covers
 * the common cases. Unknown icons fall through with the trailing path
 * segment as the icon name and a diagnostic-worthy hint surfaces from the
 * caller (Starlight will fail at build time if the icon is unknown).
 *
 * Pure: takes the raw extras dict, returns immutable entries. No I/O.
 */

export interface StarlightSocialEntry {
  readonly icon: string;
  readonly label: string;
  readonly href: string;
}

const ICON_MAP: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'fontawesome/brands/github': 'github',
    'fontawesome/brands/github-alt': 'github',
    'fontawesome/brands/gitlab': 'gitlab',
    'fontawesome/brands/bitbucket': 'bitbucket',
    'fontawesome/brands/twitter': 'twitter',
    'fontawesome/brands/x-twitter': 'x.com',
    'fontawesome/brands/discord': 'discord',
    'fontawesome/brands/mastodon': 'mastodon',
    'fontawesome/brands/linkedin': 'linkedin',
    'fontawesome/brands/linkedin-in': 'linkedin',
    'fontawesome/brands/youtube': 'youtube',
    'fontawesome/brands/twitch': 'twitch',
    'fontawesome/brands/instagram': 'instagram',
    'fontawesome/brands/facebook': 'facebook',
    'fontawesome/brands/threads': 'threads',
    'fontawesome/brands/reddit': 'reddit',
    'fontawesome/brands/stack-overflow': 'stackOverflow',
    'fontawesome/brands/medium': 'medium',
    'fontawesome/brands/dev': 'devTo',
    'fontawesome/brands/patreon': 'patreon',
    'fontawesome/brands/npm': 'npm',
    'fontawesome/brands/python': 'python',
    'fontawesome/brands/docker': 'docker',
    'fontawesome/brands/slack': 'slack',
    'fontawesome/brands/telegram': 'telegram',
    'fontawesome/brands/whatsapp': 'whatsapp',
    'fontawesome/regular/envelope': 'email',
    'fontawesome/solid/envelope': 'email',
    'fontawesome/solid/rss': 'rss',
    'fontawesome/brands/rss': 'rss',
  }),
);

export function extractSocial(
  extras: Readonly<Record<string, unknown>>,
): ReadonlyArray<StarlightSocialEntry> {
  // MkDocs stores `extra: { social: [...] }` as a nested key; the outer
  // `extras` dict carries the entire `extra` block under that name. Look
  // there first, fall back to a flat shape for tolerance.
  const inner =
    typeof extras.extra === 'object' && extras.extra !== null
      ? (extras.extra as Record<string, unknown>)
      : extras;
  const raw = inner.social;
  if (!Array.isArray(raw)) return [];
  const out: StarlightSocialEntry[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    const link = typeof obj.link === 'string' ? obj.link : null;
    if (link === null) continue;
    const iconRaw = typeof obj.icon === 'string' ? obj.icon : '';
    const icon = ICON_MAP.get(iconRaw) ?? trailingSegment(iconRaw);
    const label = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : icon;
    out.push({ icon, label, href: link });
  }
  return out;
}

function trailingSegment(iconPath: string): string {
  if (iconPath.length === 0) return 'link';
  const idx = iconPath.lastIndexOf('/');
  return idx === -1 ? iconPath : iconPath.slice(idx + 1);
}
