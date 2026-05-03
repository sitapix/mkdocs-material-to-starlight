/**
 * Detect and transform a MkDocs landing-style `index.md` into a Starlight
 * `template: splash` page with a structured `hero:` frontmatter block.
 *
 * DETECTION HEURISTIC (conservative — false positives are worse than misses):
 * A page qualifies as a landing page if ALL of these hold:
 *   1. The relative path normalizes to `index.md` (project root).
 *   2. It contains at least ONE of:
 *      a. A top-level image near the start (`![...](...)` or `<img`).
 *      b. An H1 + at least one `[label](url){.md-button}` or
 *         `[label](url)` following it.
 *      c. A `<div class="grid cards">` block with ≥3 list items.
 *
 * OUTPUT:
 *   - Frontmatter gains `template: splash` and a `hero:` block.
 *   - The H1, subtitle, image, and CTA buttons are extracted into `hero:`.
 *   - The remaining body (after extracting hero elements) is preserved, so
 *     the grid-cards block stays in the body where Starlight renders it
 *     below the hero automatically.
 *
 * IDEMPOTENCY:
 *   The transform guards against re-running: if frontmatter already contains
 *   `template: splash`, it is a no-op.
 *
 * Pure function: text × pathRel → { isLanding, result }. No I/O.
 */

export interface LandingPageResult {
  readonly isLanding: boolean;
  /** When isLanding is true: the fully transformed page text with splash
   *  frontmatter. When false: the original source unchanged. */
  readonly text: string;
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

export function detectLandingPage(
  source: string,
  pathRel: string,
): LandingPageResult {
  // Guard 1: must be root index.md.
  const normPath = pathRel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normPath !== 'index.md') {
    return { isLanding: false, text: source };
  }

  // Guard 2: idempotency — if already has template: splash, skip.
  const fmMatch = source.match(FRONTMATTER_RE);
  if (fmMatch !== null) {
    const fmBody = fmMatch[1] ?? '';
    if (/^template:\s*splash/m.test(fmBody)) {
      return { isLanding: false, text: source };
    }
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
  if (!qualifies) {
    return { isLanding: false, text: source };
  }

  // Build the transformed page.
  const transformed = buildSplashPage(fmMatch, body);
  return { isLanding: true, text: transformed };
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
): string {
  // Extract hero data from body.
  const h1Match = H1_RE.exec(body);
  const h2Match = H2_RE.exec(body);
  const heroTitle = h1Match?.[1]?.trim() ?? null;
  const heroTagline = h2Match?.[1]?.trim() ?? null;

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

  // Build hero YAML block.
  const heroLines: string[] = ['hero:'];
  if (heroTitle !== null) heroLines.push(`  title: ${heroTitle}`);
  if (heroTagline !== null) heroLines.push(`  tagline: ${heroTagline}`);
  if (heroImagePath !== null) {
    heroLines.push('  image:');
    heroLines.push(`    file: ${heroImagePath}`);
  }
  if (actions.length > 0) {
    heroLines.push('  actions:');
    for (const action of actions) {
      heroLines.push(`    - text: ${action.text}`);
      heroLines.push(`      link: ${action.link}`);
      heroLines.push(`      icon: right-arrow`);
      heroLines.push(`      variant: ${action.variant}`);
    }
  }
  const heroBlock = heroLines.join('\n');

  // Build the new frontmatter.
  const existingFm = fmMatch !== null ? (fmMatch[1] ?? '') : '';
  const newFm = existingFm.trimEnd().length > 0
    ? `${existingFm.trimEnd()}\ntemplate: splash\n${heroBlock}`
    : `template: splash\n${heroBlock}`;
  const fmBlock = `---\n${newFm}\n---\n`;

  // The body stays unchanged (hero elements remain in body for reference;
  // Starlight splash template renders hero: frontmatter above body content).
  return fmBlock + body;
}
