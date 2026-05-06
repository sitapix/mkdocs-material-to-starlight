import { quoteYamlScalar } from '../../domain/syntax/yaml-scalar.js';

/**
 * Detect and transform a MkDocs landing-style `index.md` into a Starlight
 * `template: splash` page with a structured `hero:` frontmatter block.
 *
 * Detection (conservative; false positives are worse than misses): the
 * relative path is `index.md` AND at least one of —
 *   a. A top-level image near the start (`![...](...)` or `<img`).
 *   b. An H1 followed by `[label](url){.md-button}` or `[label](url)`.
 *   c. A `<div class="grid cards">` block with 3+ list items.
 *
 * Output: frontmatter gains `template: splash` and a `hero:` block holding
 * the H1, subtitle, image, and CTA buttons. The remaining body is preserved
 * so the grid-cards block renders below the hero.
 *
 * Idempotent: pages already carrying `template: splash` pass through. Pure.
 */

interface HeroFrontmatter {
  readonly title?: string;
  readonly tagline?: string;
  readonly image?: { readonly file: string };
  readonly actions?: ReadonlyArray<{
    readonly text: string;
    readonly link: string;
    readonly variant: 'primary' | 'secondary';
  }>;
}

export interface LandingPageResult {
  readonly isLanding: boolean;
  /** When isLanding is true: the fully transformed page text with splash
   *  frontmatter. When false: the original source unchanged. */
  readonly text: string;
  /** Structured hero frontmatter data (always present but may be empty). */
  readonly frontmatter: { readonly hero?: HeroFrontmatter };
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

// Matches ![alt](src) near the start (first 30 lines)
const HERO_IMAGE_MD = /^!\[.*?\]\(([^)]+)\)/m;
// Matches <img or HTML image tags
const HERO_IMAGE_HTML = /<img\b[^>]*>/i;
// Matches explicit Material CTA buttons: [label](url){.md-button...}
// Only matches when the `.md-button` class is present to avoid false positives.
const CTA_BUTTON_RE = /\[([^\]]+)\]\(([^)]+)\)\{[^}]*\.md-button[^}]*\}/g;
// Matches grid cards div
const GRID_CARDS_RE = /<div[^>]+class="[^"]*grid[^"]*cards[^"]*"[^>]*>/i;
// H1 heading
const H1_RE = /^# (.+)$/m;
// H2 heading (subtitle)
const H2_RE = /^## (.+)$/m;
// Matches `{ #anchor-id }` attribute suffix (Python-Markdown attribute lists)
const HEADING_ANCHOR_SUFFIX_RE = /\s*\{\s*#[^}]+\}\s*$/;

/** Section-header words that should never be treated as a tagline. */
const SECTION_HEADER_WORDS = new Set([
  'installation',
  'getting started',
  'usage',
  'examples',
  'api',
  'reference',
  'sponsors',
  'contributors',
  'license',
  'changelog',
  'faq',
  'support',
  'links',
  'acknowledgments',
  'requirements',
]);

/**
 * Remove the `{ #anchor }` attribute-list suffix that Python-Markdown
 * appends to headings (e.g. `FastAPI { #fastapi }` → `FastAPI`).
 */
function cleanHeadingText(s: string): string {
  return s.replace(HEADING_ANCHOR_SUFFIX_RE, '').trim();
}

/**
 * Return true when `text` looks like a section header rather than a tagline.
 * A single word OR a word that matches a known section-header name is rejected.
 */
function isSectionHeader(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (!lower.includes(' ')) return true; // single word
  return SECTION_HEADER_WORDS.has(lower);
}

export function detectLandingPage(
  source: string,
  pathRel: string,
): LandingPageResult {
  const empty: LandingPageResult = { isLanding: false, text: source, frontmatter: {} };

  // Guard 1: must be root index.md.
  const normPath = pathRel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normPath !== 'index.md') return empty;

  // Guard 2: idempotency — if already has template: splash, skip.
  const fmMatch = source.match(FRONTMATTER_RE);
  if (fmMatch !== null) {
    const fmBody = fmMatch[1] ?? '';
    if (/^template:\s*splash/m.test(fmBody)) return empty;
  }

  // Determine the body region (after frontmatter) for detection.
  const bodyStart = fmMatch !== null ? fmMatch[0].length : 0;
  const body = source.slice(bodyStart);

  // Check detection conditions.
  const hasHeroImage = HERO_IMAGE_MD.test(body) || HERO_IMAGE_HTML.test(body);
  const hasH1 = H1_RE.test(body);
  const hasCTAButton = hasH1 && (body.match(CTA_BUTTON_RE)?.length ?? 0) >= 1;
  const gridCardsMatch = GRID_CARDS_RE.exec(body);
  const hasGridCards =
    gridCardsMatch !== null && countListItemsAfter(body, gridCardsMatch.index) >= 3;

  const qualifies = hasHeroImage || hasCTAButton || hasGridCards;
  if (!qualifies) return empty;

  // Build the transformed page.
  const { text, hero } = buildSplashPage(fmMatch, body);
  return { isLanding: true, text, frontmatter: { hero } };
}

/**
 * Count list items (`- ` or `* `) in the substring of `text` starting at
 * `fromIndex`. Stops at the matching closing `</div>`.
 */
function countListItemsAfter(text: string, fromIndex: number): number {
  const sub = text.slice(fromIndex);
  const closeIdx = sub.indexOf('</div>');
  const region = closeIdx === -1 ? sub : sub.slice(0, closeIdx);
  const items = region.match(/^[ \t]*[-*]\s/gm);
  return items?.length ?? 0;
}

function buildSplashPage(
  fmMatch: RegExpMatchArray | null,
  body: string,
): { text: string; hero: HeroFrontmatter } {
  // Extract and clean hero data from body.
  const h1Match = H1_RE.exec(body);
  const h2Match = H2_RE.exec(body);
  const rawTitle = h1Match?.[1]?.trim() ?? null;
  const rawTagline = h2Match?.[1]?.trim() ?? null;

  const heroTitle = rawTitle !== null ? cleanHeadingText(rawTitle) : null;
  const cleanedTagline = rawTagline !== null ? cleanHeadingText(rawTagline) : null;
  const heroTagline =
    cleanedTagline !== null && !isSectionHeader(cleanedTagline) ? cleanedTagline : null;

  // Extract hero image path.
  const heroImgMd = HERO_IMAGE_MD.exec(body);
  const heroImgHtml = HERO_IMAGE_HTML.exec(body);
  let heroImagePath: string | null = null;
  if (heroImgMd?.[1]) {
    heroImagePath = heroImgMd[1];
  } else if (heroImgHtml) {
    const srcM = /\bsrc=["']([^"']+)["']/.exec(heroImgHtml[0]);
    heroImagePath = srcM?.[1] ?? null;
  }
  // Normalise the hero image path for Starlight's `hero.image.file` schema.
  // Material's source frequently uses `../path/to/img.png` or
  // `assets/img.png` (resolved relative to the docs root). After conversion
  // the page lives at `src/content/docs/index.mdx`, so any `../` prefix
  // resolves outside `src/content/docs/` and Astro's image bundler errors
  // with "Could not find requested image". For HTTP(S) URLs and absolute
  // public-folder paths, leave the path alone — they are valid as-is. For
  // relative paths, drop to `/<basename>` so the image is served from
  // public/ (asset planner already copies docs/* to public/* by default).
  if (heroImagePath !== null) {
    const isUrl = /^[a-z][a-z0-9+\-.]*:\/\//i.test(heroImagePath);
    const isPublic = heroImagePath.startsWith('/');
    if (!isUrl && !isPublic) {
      const stripped = heroImagePath.replace(/[?#].*$/, '');
      const slashIdx = stripped.lastIndexOf('/');
      const basename = slashIdx === -1 ? stripped : stripped.slice(slashIdx + 1);
      heroImagePath = `/${basename}`;
    }
  }

  // Extract CTA buttons (only explicit .md-button ones).
  const actions: Array<{ text: string; link: string; variant: 'primary' | 'secondary' }> = [];
  const ctaRe = /\[([^\]]+)\]\(([^)]+)\)\{[^}]*\.md-button[^}]*\}/g;
  let ctaMatch: RegExpExecArray | null;
  while ((ctaMatch = ctaRe.exec(body)) !== null) {
    const label = ctaMatch[1] ?? '';
    const link = ctaMatch[2] ?? '';
    // Skip image-like labels (contain exclamation) or empty labels.
    if (label.trim().length === 0) continue;
    actions.push({
      text: label,
      link,
      variant: actions.length === 0 ? 'primary' : 'secondary',
    });
  }

  // Decide which hero image schema fits: `image.file` (Astro-bundled,
  // src-relative path) vs `image.html` (raw markup, used for public-served
  // images). Public paths (`/<…>`) and external URLs both go through
  // `image.html`; only src-relative paths survive into `image.file`.
  const heroImageHtml =
    heroImagePath !== null &&
    (heroImagePath.startsWith('/') ||
      /^[a-z][a-z0-9+\-.]*:\/\//i.test(heroImagePath))
      ? `<img src="${heroImagePath}" alt="" />`
      : null;

  // Build structured hero frontmatter object.
  const hero: HeroFrontmatter = {
    ...(heroTitle !== null ? { title: heroTitle } : {}),
    ...(heroTagline !== null ? { tagline: heroTagline } : {}),
    ...(heroImagePath !== null && heroImageHtml === null
      ? { image: { file: heroImagePath } }
      : {}),
    ...(actions.length > 0 ? { actions } : {}),
  };

  // Build hero YAML block. Starlight's docs schema rejects an empty `hero:`
  // key ("Expected type 'object', received 'object'") — when none of title /
  // tagline / image / actions could be extracted, drop the key entirely
  // rather than emit a stub. Real-world: PowerTools `index.md` is wrapped
  // in HTML/Material idioms our extractor can't dissect, so every field
  // comes back null.
  const hasAnyHero =
    heroTitle !== null ||
    heroTagline !== null ||
    heroImagePath !== null ||
    actions.length > 0;
  const heroLines: string[] = ['hero:'];
  if (heroTitle !== null) heroLines.push(`  title: ${quoteYamlScalar(heroTitle)}`);
  if (heroTagline !== null) heroLines.push(`  tagline: ${quoteYamlScalar(heroTagline)}`);
  if (heroImagePath !== null) {
    heroLines.push('  image:');
    if (heroImageHtml !== null) {
      heroLines.push(`    html: '${heroImageHtml.replace(/'/g, "''")}'`);
    } else {
      heroLines.push(`    file: ${heroImagePath}`);
    }
  }
  if (actions.length > 0) {
    heroLines.push('  actions:');
    for (const action of actions) {
      heroLines.push(`    - text: ${quoteYamlScalar(action.text)}`);
      heroLines.push(`      link: ${quoteYamlScalar(action.link)}`);
      heroLines.push(`      icon: right-arrow`);
      heroLines.push(`      variant: ${action.variant}`);
    }
  }
  const heroBlock = hasAnyHero ? heroLines.join('\n') : '';

  // Build the new frontmatter. Strip any pre-existing `template:` key from
  // the source frontmatter (e.g. Material's `template: welcome.html`)
  // before re-adding `template: splash` — duplicate YAML keys at the same
  // indent level are a fatal parse error in Astro's frontmatter loader.
  const rawFm = fmMatch !== null ? (fmMatch[1] ?? '') : '';
  const existingFm = rawFm
    .split('\n')
    .filter((line) => !/^template\s*:/.test(line))
    .join('\n');
  const baseFm = existingFm.trimEnd().length > 0
    ? `${existingFm.trimEnd()}\ntemplate: splash`
    : `template: splash`;
  const newFm = heroBlock.length > 0 ? `${baseFm}\n${heroBlock}` : baseFm;
  const fmBlock = `---\n${newFm}\n---\n`;

  // The body stays unchanged (hero elements remain in body for reference;
  // Starlight splash template renders hero: frontmatter above body content).
  return { text: fmBlock + body, hero };
}
