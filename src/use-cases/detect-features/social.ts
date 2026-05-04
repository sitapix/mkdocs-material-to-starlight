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
    'fontawesome/brands/patreon': 'patreon',
    'fontawesome/brands/npm': 'npm',
    'fontawesome/brands/slack': 'slack',
    'fontawesome/brands/telegram': 'telegram',
    'fontawesome/brands/pinterest': 'pinterest',
    'fontawesome/brands/tiktok': 'tiktok',
    'fontawesome/regular/envelope': 'email',
    'fontawesome/solid/envelope': 'email',
    'fontawesome/solid/rss': 'rss',
    'fontawesome/brands/rss': 'rss',
    'fontawesome/solid/phone': 'phone',
    // Icons Material exposes that have NO Starlight equivalent: fall back
    // to the generic `external` icon so the build does not crash. Starlight's
    // social-icon enum is finite; unmapped FontAwesome glyphs (`globe`,
    // `home`, `link`, `medium`, `dev`, `python`, `docker`, `whatsapp`,
    // `youtube-play` variants, etc.) all render as `external` instead of
    // breaking the site config validation.
    'fontawesome/brands/medium': 'external',
    'fontawesome/brands/dev': 'external',
    'fontawesome/brands/python': 'external',
    'fontawesome/brands/docker': 'external',
    'fontawesome/brands/whatsapp': 'external',
    'fontawesome/solid/globe': 'external',
    'fontawesome/solid/house': 'external',
    'fontawesome/solid/home': 'external',
    'fontawesome/solid/link': 'external',
    'fontawesome/solid/external-link': 'external',
  }),
);

/**
 * Subset of Starlight's `social[].icon` enum that the converter is allowed
 * to emit. Anything outside this set crashes Starlight's config validator
 * at build time, so the extractor falls back to `external` for unknowns.
 */
const VALID_SOCIAL_ICONS: ReadonlySet<string> = new Set([
  'github', 'gitlab', 'bitbucket', 'codePen', 'farcaster', 'discord', 'gitter',
  'twitter', 'x.com', 'mastodon', 'codeberg', 'youtube', 'threads', 'linkedin',
  'twitch', 'azureDevOps', 'microsoftTeams', 'instagram', 'stackOverflow',
  'telegram', 'rss', 'facebook', 'email', 'phone', 'reddit', 'patreon',
  'signal', 'slack', 'matrix', 'hackerOne', 'openCollective', 'blueSky',
  'discourse', 'zulip', 'pinterest', 'tiktok', 'external', 'npm',
]);

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
    const mapped = ICON_MAP.get(iconRaw) ?? trailingSegment(iconRaw);
    // Starlight's `social[].icon` is a finite enum; falling back to whatever
    // the user wrote in mkdocs.yml will fail config validation. Substitute
    // `external` for any unmapped value so the build stays alive.
    const icon = VALID_SOCIAL_ICONS.has(mapped) ? mapped : 'external';
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
